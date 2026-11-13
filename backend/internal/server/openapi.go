package server

import (
	"strings"
)

func (s *Server) OpenAPI() M {
	paths := M{}
	for _, route := range s.routes() {
		parts := strings.SplitN(route.pattern, " ", 2)
		if len(parts) != 2 {
			continue
		}
		method, path := strings.ToLower(parts[0]), parts[1]
		item, ok := paths[path].(map[string]any)
		if !ok {
			item = M{}
			paths[path] = item
		}
		parameters := []M{}
		for _, part := range strings.Split(path, "/") {
			if strings.HasPrefix(part, "{") {
				name := strings.Trim(part, "{}")
				parameters = append(parameters, M{"name": name, "in": "path", "required": true, "schema": M{"type": "string"}})
			}
		}
		operation := M{"operationId": method + strings.NewReplacer("/", "_", "{", "", "}", "", "-", "_").Replace(path), "parameters": parameters, "responses": M{"200": M{"description": "Success; JSON matches the frontend contracts"}, "400": M{"description": "Invalid request", "content": M{"application/json": M{"schema": M{"$ref": "#/components/schemas/Error"}}}}, "401": M{"description": "Session required"}, "403": M{"description": "Access denied"}, "404": M{"description": "Object unavailable"}, "409": M{"description": "Conflict"}, "429": M{"description": "Rate limit"}}}
		if route.status == 201 {
			operation["responses"].(map[string]any)["201"] = M{"description": "Created"}
		}
		if route.access == "public" {
			operation["security"] = []M{}
		} else {
			operation["security"] = []M{{"cookieSession": []string{}}}
		}
		if method == "post" || method == "put" || method == "patch" {
			operation["requestBody"] = M{"required": false, "content": M{"application/json": M{"schema": M{"type": "object", "additionalProperties": true}}}}
		}
		if path == "/api/upload" {
			operation["requestBody"] = M{"required": true, "content": M{"multipart/form-data": M{"schema": M{"type": "object", "required": []string{"file"}, "properties": M{"file": M{"type": "string", "format": "binary", "description": "Maximum 10 MiB"}, "purpose": M{"type": "string", "enum": []string{"post", "profile", "message"}}}}}}}
		}
		if path == "/api/events" {
			operation["responses"].(map[string]any)["200"] = M{"description": "Authenticated SSE; event names: message:new, messages:changed, conversation:update, typing:update", "content": M{"text/event-stream": M{"schema": M{"type": "string"}}}}
		}
		item[method] = operation
	}
	return M{"openapi": "3.1.0", "info": M{"title": "Zephyr Go API", "version": "0.1.0", "description": "One PostgreSQL database. All private operations require a server-side session. See README and STABILITY for payload and migration details."}, "paths": paths, "components": M{"securitySchemes": M{"cookieSession": M{"type": "apiKey", "in": "cookie", "name": sessionCookie}}, "schemas": M{"Error": M{"type": "object", "required": []string{"error"}, "properties": M{"error": M{"type": "string"}}}}}}
}
