// Package repository — helpers partagés.
package repository

// scanner est l'interface commune entre pgx.Row et pgx.Rows pour Scan().
type scanner interface {
	Scan(dest ...any) error
}
