package migrations

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"embed"
	"encoding/hex"
	"fmt"
	"io/fs"
	"sort"
)

//go:embed */migration.sql
var Files embed.FS

func Apply(ctx context.Context, db *sql.DB) error {
	conn, err := db.Conn(ctx)
	if err != nil {
		return err
	}
	defer conn.Close()
	if _, err = conn.ExecContext(ctx, `SELECT pg_advisory_lock(782019221)`); err != nil {
		return err
	}
	defer conn.ExecContext(context.Background(), `SELECT pg_advisory_unlock(782019221)`)
	if _, err = conn.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS "_zephyr_migrations" (name TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`); err != nil {
		return err
	}
	names, err := fs.Glob(Files, "*/migration.sql")
	if err != nil {
		return err
	}
	sort.Strings(names)
	var hasPrisma bool
	if err = conn.QueryRowContext(ctx, `SELECT to_regclass('"_prisma_migrations"') IS NOT NULL`).Scan(&hasPrisma); err != nil {
		return err
	}
	for _, name := range names {
		body, err := Files.ReadFile(name)
		if err != nil {
			return err
		}
		hash := sha256.Sum256(body)
		checksum := hex.EncodeToString(hash[:])
		var previous string
		err = conn.QueryRowContext(ctx, `SELECT checksum FROM "_zephyr_migrations" WHERE name=$1`, name).Scan(&previous)
		if err == nil {
			if previous != checksum {
				return fmt.Errorf("migration checksum changed: %s", name)
			}
			continue
		}
		if err != sql.ErrNoRows {
			return err
		}
		migrated := false
		if hasPrisma {
			directory := name[:len(name)-len("/migration.sql")]
			if err = conn.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM "_prisma_migrations" WHERE migration_name=$1 AND finished_at IS NOT NULL AND rolled_back_at IS NULL)`, directory).Scan(&migrated); err != nil {
				return err
			}
		}
		tx, err := conn.BeginTx(ctx, nil)
		if err != nil {
			return err
		}
		if !migrated {
			_, err = tx.ExecContext(ctx, string(body))
		}
		if err == nil {
			_, err = tx.ExecContext(ctx, `INSERT INTO "_zephyr_migrations" (name,checksum) VALUES ($1,$2)`, name, checksum)
		}
		if err != nil {
			tx.Rollback()
			return fmt.Errorf("migration %s: %w", name, err)
		}
		if err = tx.Commit(); err != nil {
			return err
		}
	}
	return nil
}
