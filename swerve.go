package swerve

import (
	"bytes"
	"crypto/rand"
	_ "embed"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
)

const StatusCookieName = "swerve.installed"

//go:generate rm -rf ./swerve
//go:generate git clone -b main https://github.com/swerve-framework/swerve
//go:generate find ./swerve -not -regex ^\./swerve\(/swerve\.[^/]*\)?$ -delete
var (
	//go:embed swerve/swerve.client.js
	clientJS []byte
	//go:embed swerve/swerve.bootstrap.js
	bootstrapTemplate []byte
	//go:embed swerve/swerve.core.js
	coreJS []byte
)

// Handler adds Swerve handling to h
func Handler(h http.Handler, options ...Option) http.Handler {
	config, err := DefaultConfig.Copy()
	if err != nil {
		panic(err)
	}
	for _, option := range options {
		option(config)
	}

	mux := http.NewServeMux()
	mux.Handle("/", h)
	mux.HandleFunc("/swerve.client.js", handleClient)
	mux.HandleFunc("/swerve.bootstrap.js", handleBootstrap)
	mux.HandleFunc("/swerve.core.js", handleCore)
	mux.HandleFunc("/swerve.config.json", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(config)
	})
	return mux
}

func HandlerFunc(h http.HandlerFunc, options ...Option) http.Handler {
	return Handler(h, options...)
}

func handleClient(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/javascript")
	w.Write(clientJS)
}

func handleBootstrap(w http.ResponseWriter, r *http.Request) {
	if isInstalled(r) {
		// the bootstrap file must only be served once per installation
		w.WriteHeader(http.StatusNotFound)
		return
	}

	k := make([]byte, 32) // 32-byte keys for AES-256
	if _, err := rand.Read(k); err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	ek := make([]byte, base64.RawStdEncoding.EncodedLen(len(k)))
	base64.RawURLEncoding.Encode(ek, k)
	jwk := fmt.Sprintf(`{"alg":"A256GCM","ext":true,"k":"%s","key_ops":["encrypt","decrypt"],"kty":"oct"}`, ek)
	bootstrap := bytes.Replace(bootstrapTemplate, []byte("$$ENCRYPTION_KEY$$"), []byte(jwk), 1)
	w.Header().Set("Content-Type", "text/javascript")
	w.Write(bootstrap)
}

func handleCore(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/javascript")
	w.Write(coreJS)
}

func isInstalled(r *http.Request) bool {
	_, err := r.Cookie(StatusCookieName)
	return err != http.ErrNoCookie
}
