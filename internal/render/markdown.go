// Package render handles markdown -> sanitized HTML.
//
// The renderer is configured once at process start. Goldmark with GFM produces
// the HTML; bluemonday's UGC policy strips anything that could XSS (scripts,
// iframes, inline event handlers). Images and links are preserved.
package render

import (
	"bytes"
	"strings"
	"sync"

	"github.com/microcosm-cc/bluemonday"
	"github.com/yuin/goldmark"
	"github.com/yuin/goldmark/extension"
	"github.com/yuin/goldmark/renderer/html"
)

var (
	once   sync.Once
	md     goldmark.Markdown
	policy *bluemonday.Policy
)

func get() (goldmark.Markdown, *bluemonday.Policy) {
	once.Do(func() {
		md = goldmark.New(
			goldmark.WithExtensions(extension.GFM),
			goldmark.WithRendererOptions(html.WithHardWraps()),
		)
		policy = bluemonday.UGCPolicy()
		policy.AllowURLSchemes("http", "https")
		policy.AllowRelativeURLs(true)
	})
	return md, policy
}

// MarkdownToSafeHTML renders markdown to sanitized HTML. Safe to return
// directly in API responses for the client to set via innerHTML.
func MarkdownToSafeHTML(src string) string {
	md, policy := get()
	if strings.TrimSpace(src) == "" {
		return ""
	}
	var buf bytes.Buffer
	if err := md.Convert([]byte(src), &buf); err != nil {
		// Fallback: escape and return as plaintext-ish.
		return policy.Sanitize(src)
	}
	return policy.Sanitize(buf.String())
}

// PlainText strips markdown formatting for OG descriptions and other plain
// contexts. Cheap approximation: run through the markdown renderer, then
// strip all tags via the empty policy.
func PlainText(src string, maxLen int) string {
	md, _ := get()
	if strings.TrimSpace(src) == "" {
		return ""
	}
	var buf bytes.Buffer
	if err := md.Convert([]byte(src), &buf); err != nil {
		buf.Reset()
		buf.WriteString(src)
	}
	plain := bluemonday.StrictPolicy().Sanitize(buf.String())
	plain = strings.Join(strings.Fields(plain), " ")
	if maxLen > 0 && len(plain) > maxLen {
		plain = strings.TrimRight(plain[:maxLen], " ") + "..."
	}
	return plain
}
