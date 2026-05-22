package util

import "testing"

func TestSlugify(t *testing.T) {
	tests := []struct {
		in   string
		want string
	}{
		{"Jane's Birthday", "janes-birthday"},
		{"Fisher's & Lisa's Holiday Party", "fishers-and-lisas-holiday-party"},
		{"Hello World", "hello-world"},
		{"Multiple   Spaces", "multiple-spaces"},
		{"Smart ’Quotes’", "smart-quotes"}, // space stays as hyphen, smart quote disappears
		{"NYE 2026!", "nye-2026"},
		{"--leading and trailing--", "leading-and-trailing"},
		{"st. patrick's day", "st-patricks-day"},
		{"", ""},
	}
	for _, tt := range tests {
		t.Run(tt.in, func(t *testing.T) {
			got := Slugify(tt.in)
			if got != tt.want {
				t.Fatalf("Slugify(%q) = %q, want %q", tt.in, got, tt.want)
			}
		})
	}
}
