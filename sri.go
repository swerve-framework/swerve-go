package swerve

import (
	"crypto/sha256"
	"crypto/sha512"
	"encoding/base64"
	"hash"
)

func SHA256Hash(data []byte) string {
	return prefixedBase64Hash(data, sha256.New(), "sha256-")
}

func SHA384Hash(data []byte) string {
	return prefixedBase64Hash(data, sha512.New384(), "sha384-")
}

func SHA512Hash(data []byte) string {
	return prefixedBase64Hash(data, sha512.New(), "sha512-")
}

func prefixedBase64Hash(data []byte, hash hash.Hash, prefix string) string {
	hash.Write(data)
	return prefix + base64.StdEncoding.EncodeToString(hash.Sum(nil))
}
