package server

import (
	"bufio"
	"context"
	"database/sql"
	"database/sql/driver"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/jackc/pgx/v5/pgconn"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"sync"
	"testing"
	"time"
	"zephyr/migrations"
)

type pgBridge struct {
	sync.Mutex
	cmd    *exec.Cmd
	input  io.WriteCloser
	output *bufio.Reader
}
type bridgeDriver struct{ bridge *pgBridge }
type bridgeConn struct{ bridge *pgBridge }
type bridgeStmt struct {
	connection *bridgeConn
	query      string
}
type bridgeTx struct{ connection *bridgeConn }
type bridgeResult struct{ count int64 }

func (r bridgeResult) LastInsertId() (int64, error) { return 0, nil }
func (r bridgeResult) RowsAffected() (int64, error) { return r.count, nil }

type bridgeRows struct {
	columns  []string
	rows     [][]driver.Value
	position int
}

func (r *bridgeRows) Columns() []string { return r.columns }
func (r *bridgeRows) Close() error      { return nil }
func (r *bridgeRows) Next(out []driver.Value) error {
	if r.position >= len(r.rows) {
		return io.EOF
	}
	copy(out, r.rows[r.position])
	r.position++
	return nil
}
func (d bridgeDriver) Open(string) (driver.Conn, error)     { return &bridgeConn{d.bridge}, nil }
func (c *bridgeConn) Prepare(q string) (driver.Stmt, error) { return &bridgeStmt{c, q}, nil }
func (c *bridgeConn) Close() error                          { return nil }
func (c *bridgeConn) Begin() (driver.Tx, error) {
	return c.BeginTx(context.Background(), driver.TxOptions{})
}
func (c *bridgeConn) CheckNamedValue(*driver.NamedValue) error { return nil }
func (c *bridgeConn) BeginTx(ctx context.Context, options driver.TxOptions) (driver.Tx, error) {
	query := "BEGIN"
	if options.Isolation == driver.IsolationLevel(sql.LevelSerializable) {
		query += " ISOLATION LEVEL SERIALIZABLE"
	}
	_, err := c.ExecContext(ctx, query, nil)
	return bridgeTx{c}, err
}
func (t bridgeTx) Commit() error {
	_, err := t.connection.ExecContext(context.Background(), "COMMIT", nil)
	return err
}
func (t bridgeTx) Rollback() error {
	_, err := t.connection.ExecContext(context.Background(), "ROLLBACK", nil)
	return err
}
func (s *bridgeStmt) Close() error  { return nil }
func (s *bridgeStmt) NumInput() int { return -1 }
func (s *bridgeStmt) Exec(values []driver.Value) (driver.Result, error) {
	a := make([]driver.NamedValue, len(values))
	for i, v := range values {
		a[i] = driver.NamedValue{Ordinal: i + 1, Value: v}
	}
	return s.connection.ExecContext(context.Background(), s.query, a)
}
func (s *bridgeStmt) Query(values []driver.Value) (driver.Rows, error) {
	a := make([]driver.NamedValue, len(values))
	for i, v := range values {
		a[i] = driver.NamedValue{Ordinal: i + 1, Value: v}
	}
	return s.connection.QueryContext(context.Background(), s.query, a)
}

type bridgeResponse struct {
	Result struct {
		Fields []struct {
			Name string `json:"name"`
			OID  int    `json:"dataTypeID"`
		} `json:"fields"`
		Rows     []map[string]any `json:"rows"`
		Affected int64            `json:"affectedRows"`
	} `json:"result"`
	Error *struct{ Message, Code string } `json:"error"`
}

func (c *bridgeConn) call(ctx context.Context, query string, values []driver.NamedValue) (bridgeResponse, error) {
	c.bridge.Lock()
	defer c.bridge.Unlock()
	var response bridgeResponse
	select {
	case <-ctx.Done():
		return response, ctx.Err()
	default:
	}
	args := make([]any, len(values))
	for i, v := range values {
		args[i] = v.Value
	}
	request, _ := json.Marshal(M{"query": query, "args": args})
	if _, err := c.bridge.input.Write(append(request, '\n')); err != nil {
		return response, err
	}
	line, err := c.bridge.output.ReadBytes('\n')
	if err != nil {
		return response, err
	}
	if err = json.Unmarshal(line, &response); err != nil {
		return response, fmt.Errorf("bridge response: %w", err)
	}
	if response.Error != nil {
		return response, &pgconn.PgError{Message: response.Error.Message, Code: response.Error.Code}
	}
	return response, nil
}
func (c *bridgeConn) ExecContext(ctx context.Context, q string, args []driver.NamedValue) (driver.Result, error) {
	response, err := c.call(ctx, q, args)
	return bridgeResult{response.Result.Affected}, err
}
func (c *bridgeConn) QueryContext(ctx context.Context, q string, args []driver.NamedValue) (driver.Rows, error) {
	response, err := c.call(ctx, q, args)
	if err != nil {
		return nil, err
	}
	rows := &bridgeRows{}
	for _, f := range response.Result.Fields {
		rows.columns = append(rows.columns, f.Name)
	}
	for _, value := range response.Result.Rows {
		row := []driver.Value{}
		for _, f := range response.Result.Fields {
			v := value[f.Name]
			switch f.OID {
			case 114, 3802:
				if v != nil {
					raw, _ := json.Marshal(v)
					v = raw
				}
			case 1114, 1184:
				if text, ok := v.(string); ok {
					parsed, e := time.Parse(time.RFC3339Nano, text)
					if e != nil {
						parsed, e = time.Parse("2006-01-02 15:04:05", text)
					}
					if e != nil {
						return nil, e
					}
					v = parsed
				}
			case 20, 21, 23:
				if text, ok := v.(string); ok {
					v, _ = strconv.ParseInt(text, 10, 64)
				} else if number, ok := v.(float64); ok {
					v = int64(number)
				}
			}
			switch converted := v.(type) {
			case map[string]any, []any:
				raw, _ := json.Marshal(converted)
				v = raw
			}
			row = append(row, v)
		}
		rows.rows = append(rows.rows, row)
	}
	return rows, nil
}

var testCounter int

func memoryDB(t *testing.T) *sql.DB {
	t.Helper()
	script, err := filepath.Abs("../../testdata/pglite.mjs")
	if err != nil {
		t.Fatal(err)
	}
	cmd := exec.Command("node", script)
	cmd.Stderr = os.Stderr
	in, err := cmd.StdinPipe()
	if err != nil {
		t.Fatal(err)
	}
	out, err := cmd.StdoutPipe()
	if err != nil {
		t.Fatal(err)
	}
	if err = cmd.Start(); err != nil {
		t.Fatal(err)
	}
	bridge := &pgBridge{cmd: cmd, input: in, output: bufio.NewReader(out)}
	testCounter++
	name := fmt.Sprintf("pglite-%d", testCounter)
	sql.Register(name, bridgeDriver{bridge})
	db, err := sql.Open(name, "")
	if err != nil {
		t.Fatal(err)
	}
	db.SetMaxOpenConns(1)
	t.Cleanup(func() {
		db.Close()
		in.Close()
		if err := cmd.Wait(); err != nil && !errors.Is(err, os.ErrProcessDone) {
			t.Log(err)
		}
	})
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	if err = migrations.Apply(ctx, db); err != nil {
		t.Fatal(err)
	}
	return db
}
