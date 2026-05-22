// Package util holds small, dependency-light helpers shared across packages.
package util

import (
	"crypto/rand"
	"math/big"
	"regexp"
	"strings"
	"time"
)

var (
	// Stripped entirely (no hyphen): apostrophes, smart quotes, periods,
	// backticks. "Jane's" -> "janes", not "jane-s".
	slugStrip   = regexp.MustCompile(`['` + "`" + `\.\x{2018}\x{2019}\x{201C}\x{201D}]`)
	nonSlug      = regexp.MustCompile(`[^a-z0-9-]+`)
	multiHyphen  = regexp.MustCompile(`-{2,}`)
	codeAlphabet = []rune("23456789ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz") // no 0/O/1/l/I
)

// Slugify produces a URL-safe slug from a free-text name. Lowercased,
// alphanumeric + hyphens, no leading/trailing hyphens, no consecutive hyphens.
// Joining punctuation (apostrophes, periods, quotes) is stripped, not
// replaced with a hyphen, so "Jane's Birthday" -> "janes-birthday".
func Slugify(in string) string {
	out := strings.ToLower(strings.TrimSpace(in))
	out = strings.ReplaceAll(out, "&", " and ")
	out = slugStrip.ReplaceAllString(out, "")
	out = nonSlug.ReplaceAllString(out, "-")
	out = multiHyphen.ReplaceAllString(out, "-")
	out = strings.Trim(out, "-")
	if len(out) > 80 {
		out = out[:80]
		out = strings.TrimRight(out, "-")
	}
	return out
}

// NewCode returns a 6-char access code from an unambiguous alphabet
// (excludes 0/O/1/l/I).
func NewCode() string {
	return randomFromAlphabet(codeAlphabet, 6)
}

// NewID returns a short opaque identifier. Used for event/attendee/response
// IDs; not security-sensitive since they aren't guessable in the public URL
// (event lookup is by slug, code-gated).
func NewID() string {
	return randomFromAlphabet(codeAlphabet, 16) + "-" + time.Now().UTC().Format("20060102150405")
}

func randomFromAlphabet(alphabet []rune, n int) string {
	max := big.NewInt(int64(len(alphabet)))
	var b strings.Builder
	b.Grow(n)
	for i := 0; i < n; i++ {
		r, _ := rand.Int(rand.Reader, max)
		b.WriteRune(alphabet[r.Int64()])
	}
	return b.String()
}
