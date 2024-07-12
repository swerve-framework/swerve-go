package swerve

import (
	"encoding/json"
	"io/fs"
)

type Import struct {
	Path   string         `json:"path,omitempty"`
	Code   string         `json:"code,omitempty"`
	Config map[string]any `json:"config,omitempty"`
}

type Config struct {
	Title             string         `json:"title,omitempty"`
	Imports           []*Import      `json:"imports,omitempty"`
	KnownHashes       map[string]any `json:"knownHashes,omitempty"`
	NoReloadOnInstall bool           `json:"noReloadOnInstall,omitempty"`
	ClaimOnInstall    bool           `json:"claimOnInstall,omitempty"`
}

func (c *Config) Copy() (*Config, error) {
	newConfig := &Config{}
	b, err := json.Marshal(c)
	if err != nil {
		return nil, err
	}
	if err = json.Unmarshal(b, newConfig); err != nil {
		return nil, err
	}
	return newConfig, err
}

type Option func(*Config)

func WithTitle(title string) Option {
	return func(c *Config) {
		c.Title = title
	}
}

func WithImports(imports ...*Import) Option {
	return func(c *Config) {
		c.Imports = append(c.Imports, imports...)
	}
}

func WithNoReloadOnInstall(value bool) Option {
	return func(c *Config) {
		c.NoReloadOnInstall = value
	}
}

func WithClaimOnInstall(value bool) Option {
	return func(c *Config) {
		c.ClaimOnInstall = true
	}
}

func WithKnownHashes(hashes ...string) Option {
	return func(c *Config) {
		if c.KnownHashes == nil {
			c.KnownHashes = make(map[string]any, len(hashes))
		}
		for _, hash := range hashes {
			c.KnownHashes[hash] = map[string]any{"reason": "config"}
		}
	}
}

func WithKnownHashesFromFS(filesystem fs.FS, hashFuncs ...func([]byte) string) Option {
	hashes := []string{}
	fs.WalkDir(filesystem, ".", func(path string, d fs.DirEntry, err error) error {
		if !d.IsDir() {
			b, err := fs.ReadFile(filesystem, path)
			if err != nil {
				return err
			}
			for _, hf := range hashFuncs {
				hashes = append(hashes, hf(b))
			}
		}
		return nil
	})
	return WithKnownHashes(hashes...)
}

func NewConfig(options ...Option) *Config {
	config := &Config{}
	for _, option := range options {
		option(config)
	}
	return config
}

var DefaultConfig = NewConfig()
