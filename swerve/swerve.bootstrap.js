
// This is the Swerve bootstrap script. It contains the absolute minimal
// amount of code necessary to get things up and running, as it's the only part
// of the system that cannot be updated without losing data once installed.
// Readability, simplicity, and correctness are top priorities.
// 
// The bootstrap script has a handful of critical responsibilities:
// 
//  1. It acts as the persistence mechanism for your encryption key
//  2. It implements a minimal cryptographic API to protect the cache
//  3. It registers event listeners and forwards events
//  4. It fetches, caches, and imports the Swerve core library
// 
// One of the important features of this script is that it accesses no
// properties of the global object after it starts importing the core library.
// That means the core library is free to redefine any globals as needed
// without influencing anything here.
{
  // Below is your secret encryption key. It is dynamically generated and
  // unique to your installation. If you are inspecting this file, make sure
  // not to reveal the key to anybody. It's the key to making sure a server
  // cannot update your local copy of the webapp without you noticing.
  const __ENCRYPTION_KEY__ = $$ENCRYPTION_KEY$$;

  // ForwardEvent is the event type that's used to expose global events, such
  // as fetch, to the core library and its imports. These events need to be
  // forwarded because listeners for the original event cannot be added
  // asynchronously. ForwardEvent wraps the original event and allows
  // asynchronously added listeners to act on it.
  class ForwardEvent extends Event {
    original = null;
    constructor(event) {
      super(event.type, { cancelable: true });
      this.original = event;
    }
  }

  // FetchForwardEvent is a subclass of ForwardEvent, a special case for
  // handling respondWith functionality.
  class FetchForwardEvent extends ForwardEvent {
    #done; #resolve;
    #promise = new Promise(resolve => this.#resolve = resolve);
    constructor(event) {
      super(event);
      // Because respondWith must be called synchronously, we do it when
      // constructing the FetchForwardEvent. The FetchForwardEvent's own
      // respondWith method can then be used to set the value the the promise
      // passed to the original respondWith implementation resolves to.
      event.respondWith(this.#promise);
    }
    respondWith(response) {
      if (this.#done) {
        throw new DOMException(undefined, "InvalidStateError");
      }
      this.#done = true;
      this.preventDefault();
      this.#resolve(response);
    }
  }

  // Everything else is wrapped neatly in the singleton below. The main
  // entrypoint of this script can be found in the static initialization block.
  class Swerve extends EventTarget {
    static #this = self.swerve = new this;

    // #key holds the ready-to-use imported encryption key. The
    // actual key material is a constant in the enclosing scope instead of
    // being defined here directly. This prevents it from being exfiltrated via
    // swerve.constructor.toString().
    static #key;

    // #resolve stores the function that resolves the #ready Promise, so that it
    // can be called after importing the core library
    static #resolve;

    // ready is a Promise that resolves once the core library has been imported
    static #ready;

    static {
      Swerve.#ready = new Promise(resolve => Swerve.#resolve = resolve)
        .then(_ => console.debug("core library imported"));

      // import key from key material declared in the enclosing scope
      // TODO: support algorithm upgrades either through deriveKey or JWK
      // templates
      Swerve.#key = crypto.subtle.importKey(
        "jwk", __ENCRYPTION_KEY__, "AES-GCM", false, ["encrypt", "decrypt"]);

      // EITHER installation has already happened and the cache exists, in
      // which case we import the core library with installing=false
      Swerve.#getCoreFromCache()
        .then(response => {
          console.debug("loaded '/swerve.core.js' from cache");
          Swerve.#importCore(response, false)
        }).catch(() => { /* nop */});

      // ...OR the installation will happen in this handler, in which case we
      // cache the core library and import it with installing=true. We don't do
      // this in a catch block of the #getCoreFromCache call because the cache
      // manipulated. Instead we use the install event, which can't be spoofed.
      self.addEventListener("install", event => event.waitUntil((async () => {
        await self.caches.delete("swerve.core");
        const cache = await self.caches.open("swerve.core");
        const response = await fetch("/swerve.core.js");
        if (!response.ok) {
          throw "bad response while fetching /swerve.core.js";
        }
        console.debug("caching '/swerve.core.js'");
        await cache.put("/swerve.core.js",
          await Swerve.#this.tagResponse(response.clone()));
        Swerve.#importCore(response, true);
      })()));

      // forward all events
      Object.keys(self)
        .filter(key => key.indexOf("on") === 0 && self[key] === null)
        .map(key => key.substring(2))
        .forEach(
          key => self.addEventListener(key, Swerve.#forwardEvent));
    }

    // #forwardEvent takes an event and forwards it to the listeners on
    // the swerve object. Before forwarding it waits for ready, extending
    // the original event if necessary.
    static #forwardEvent(event) {
      const forward = event instanceof FetchEvent
        ? new FetchForwardEvent(event)
        : new ForwardEvent(event);
      if (event instanceof ExtendableEvent) {
        // dispatchEvent is synchronous so that all event listeners return
        // before the promise passed to waitUntil resolves
        event.waitUntil(Swerve.#this.ready().then(
          _ => Swerve.#this.dispatchEvent(forward)));
      } else {
        // Plain Events don't allow us to wait, so basically just fire away
        // and hope the worker doesn't terminate before core library is
        // ready.
        // 
        // MDN lists one only one event, pushsubscriptionchange, that isn't
        // extendable, and even that seems like an error, but having this
        // here at least makes things somewhat future-proof.
        console.warn(`'${event.type}' is a plain Event and does not `
          + `allow waiting; listeners may not execute reliably`);
        Swerve.#this.ready().then(
          _ => Swerve.#this.dispatchEvent(forward));
      }
    }

    // #getCoreFromCache returns the core library as a Response object from the
    // encrypted cache. If there cache entry doesn't exist or cannot be
    // decrypted, the method throws.
    static async #getCoreFromCache() {
      const cache = await self.caches.open("swerve.core");
      const response = await cache.match("/swerve.core.js");
      return await Swerve.#this.verifyResponse(response);
    }

    // #importCore installs from the Response object passed to it
    static async #importCore(response, installing) {
      console.debug("importing '/swerve.core.js'");
      Swerve.#resolve(new async function () {}.constructor(
        "installing", await response.text())(installing));
    }

    // addEventListener adds an event listener on the swerve singleton. In
    // the listener this refers to the original singleton even if the listener
    // is added through a subclass instance.
    addEventListener() {
      return EventTarget.prototype.addEventListener.apply(
        Swerve.#this, arguments);
    }

    // removeEventListener removes an event listener from the swerve
    // singleton
    removeEventListener() {
      return EventTarget.prototype.removeEventListener.apply(
        Swerve.#this, arguments);
    }

    // dispatchEvent dispatches an event to the swerve singleton
    dispatchEvent() {
      return EventTarget.prototype.dispatchEvent.apply(
        Swerve.#this, arguments);
    }

    // ready is an async function that returns when the core library has been
    // imported
    async ready() {
      await Swerve.#ready;
    }

    // encrypt returns data as an encrypted Blob
    // that can be decrypted using decrypt
    async encrypt(data, additionalData) {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const params = additionalData === undefined
        ? { name: "AES-GCM", iv } : { name: "AES-GCM", iv, additionalData }
      const ciphertext = await crypto.subtle.encrypt(
        params, await Swerve.#key, data);
      return new Blob([ iv, ciphertext ]);
    }

    // decrypt takes encrypted data and returns a decrypted ArrayBuffer
    async decrypt(data, additionalData) {
      const iv = data.slice(0, 12);
      const params = additionalData === undefined
        ? { name: "AES-GCM", iv } : { name: "AES-GCM", iv, additionalData };
      const ciphertext = data.slice(12);
      return await crypto.subtle.decrypt(
        params, await Swerve.#key, ciphertext);
    }

    // #serializeResponse serializes a Response object to the HTTP wire format
    async #serializeResponse(response) {
      const headers = [ `${response.status} ${response.statusText}` ];
      response.headers.forEach((value, key) => {
        headers.push(`${key}: ${value}`);
      });
      return await new Blob([
          headers.join("\r\n"), "\r\n\r\n",
          await response.arrayBuffer()
        ]).arrayBuffer();
    }

    // tagResponse takes in a Response object, tags it with a cryptographic
    // proof of integrity, and returns the tagged Response object. The tag
    // covers the status line, headers, and body, and the tagged Response
    // object can be verified using verifyResponse.
    async tagResponse(response) {
      const rawTag = await this.encrypt(new ArrayBuffer(),
        await this.#serializeResponse(response.clone()));
      const binaryStringTag = [ ...new Uint8Array(await rawTag.arrayBuffer()) ]
        .map(byte => String.fromCharCode(byte)).join("");
      const taggedResponse = new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers
      });
      taggedResponse.headers.set(
        "X-Swerve-Integrity-Tag",
        btoa(binaryStringTag));
      return taggedResponse;
    }

    // verifyResponse takes in a tagged Response object and verifies its
    // integrity. If the integrity verification fails, verifyResponse throws,
    // otherwise it returns the verified Response object with the tag removed.
    async verifyResponse(response) {
      const tag = response.headers.get("X-Swerve-Integrity-Tag");
      const binaryStringTag = atob(tag);
      const rawTag = Uint8Array.from(binaryStringTag, s => s.charCodeAt(0));
      response.headers.delete("X-Swerve-Integrity-Tag");
      await this.decrypt(rawTag,
        await this.#serializeResponse(response.clone()));
      return response;
    }
  };
}