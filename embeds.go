package swerve

import _ "embed"

// The Swerve client and service worker JavaScript files are embedded as byte
// slices. The files themselves are pulled from git based on the version tag in
// the SWERVE_VERSION file. To update the files, update the tag in
// SWERVE_VERSION and run go generate.
//
//go:generate rm -rf ./swerve
//go:generate xargs -a ./SWERVE_VERSION -ITAG git clone -b TAG https://github.com/swerve-framework/swerve
//go:generate find ./swerve -not -regex ^\./swerve\(/swerve\.[^/]*\)?$ -delete
var (
	//go:embed swerve/swerve.client.js
	ClientJavaScript []byte
	//go:embed swerve/swerve.bootstrap.js
	BootstrapJavaScript []byte
	//go:embed swerve/swerve.core.js
	CoreJavaScript []byte
)
