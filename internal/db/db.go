// Package db owns the SQLite store and its migrations. Pass a *Store around;
// it wraps a *sql.DB. Open the store once at startup, defer Close.
package db

import (
	"database/sql"
	"fmt"

	_ "modernc.org/sqlite"
)

type Store struct {
	DB *sql.DB
}

func Open(path string) (*Store, error) {
	// _journal=WAL improves concurrent read perf; _fk=1 enforces FKs.
	dsn := fmt.Sprintf("file:%s?_pragma=journal_mode(WAL)&_pragma=foreign_keys(1)&_pragma=busy_timeout(5000)", path)
	conn, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, err
	}
	if err := conn.Ping(); err != nil {
		return nil, err
	}
	return &Store{DB: conn}, nil
}

func (s *Store) Close() error {
	return s.DB.Close()
}
