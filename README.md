# Swerve-Go&nbsp;&nbsp;![](assets/icon.svg)

This repository contains the Go reference implementation of Swerve.

## What is Swerve?

Swerve is a framework for establishing and maintaining integrity guarantees in web applications. It is similar to some other technologies like [Meta Code Verify](https://github.com/facebookincubator/meta-code-verify/) and [Subresource Integrity (SRI)](https://developer.mozilla.org/en-US/docs/Web/Security/Subresource_Integrity). The major difference compared to Code Verify is that Swerve is not tied to any existing company, app, or infrastructure, and it only relies on standard web technologies -- no browser extension required!

## How does it work?

Swerve stands for Service Worker Encryption with Runtime Visual Enforcement. Architecturally it consists of three components:

 - **The lightweight server component** ensures that the service worker and client components are served correctly.
 - **The client library** registers the service worker and handles message passing.
 - **The service worker** is where most of the magic happens.

[Service workers](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers) are well suited for controlling what gets rendered and executed in a web application. With a service worker you can intercept any HTTP request or response, block requests, and serve alternative responses from a local cache. That's exactly what Swerve does to ensure only known active content is allowed.

The challenge with using service workers for enforcing the integrity of the rest of the web application is that the server always controls service worker updates. As soon as a server makes a new version of a service worker available, the browser automatically downloads and instantiates it. This means that a malicious or compromised server can always compromise clients by first updating any service worker controlling them.

Swerve solves this with an approach we've dubbed Service Worker Encryption.

### Service Worker Encryption

Swerve does not, and cannot, prevent a server from updating a service worker. What it does instead is it prevents any updated service worker from accessing local data. This way, even if the server is compromised and it in turn compromises both the service worker and the clients that service worker controls, no part of that compromised application can read your secrets.

To achieve this, the original Swerve service worker embeds an encryption key in its own source code. This encryption key is then used to encrypt all locally persisted data and to protect local caches using AES-GCM. Because the encryption key is embedded in the source code of the service worker, any updated worker will not be able to access it. Encryption and decryption only happens in the original service worker and the key is never exposed outside it. Clients that need to encrypt or decrypt data communicate with the service worker via message passing.

Encryption keys are generated on the server. This means that when initially installing a Swerve-based application, the user must trust that the server is behaving nicely and does not store the key. After the initial install, however, no trust in the server is assumed.

### Runtime Visual Enforcement

Service Worker Encryption prevents malicious clients from accessing user data. It does not, however, prevent a malicious client from attempting to trick the user into entering sensitive data into it. These types of spoofing attacks are instead remediated with Runtime Visual Enforcement.

Any Swerve-based application is expected to display visual indicators that allow the user to distinguish a genuine application instance from a compromised one. These visual indicators should be based on locally stored data that is protected with Service Worker Encryption.

The Swerve framework itself does not specify what Runtime Visual Enforcement should look like. The implementation specifics are left to individual applications, but an example of one possible implementation can be seen in the [demo](#demo) linked below.

## Can I start using it now?

Swerve is in very early stages of development and likely not anywhere near secure yet. You're encouraged to play with it, share feedback, and report bugs. Code contributions are also welcome, as are alternative implementations. **You should not start using it for any real-world use case yet, however.**

At this time there is very little documentation or contributing guidelines. There are no tests either, and APIs are subject to change at any time. We aim to make contributing easier as soon as time allows.

## Demo

See https://github.com/swerve-framework/keeweb for a fork of [KeeWeb](https://github.com/keeweb/keeweb) that incorporates Swerve.