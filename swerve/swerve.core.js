// AuthenticatedCache is an implementation of the Cache interface that
// performs automatic integrity checks on all cached values.
class AuthenticatedCache {
  #cache = null;

  constructor(cache) {
    this.#cache = cache;
  }

  // add is a convenience method of the Cache interface that AuthenticatedCache
  // does not implement. As the authenticated cache is highly
  // security-sensitive and the mere presence of a Response in the cache has
  // security implications, adding to the cache should always be done via
  // explicit fetch and put calls.
  async add(request) {
    throw new Error("Cache.add is not supported by AuthenticatedCache");
  }

  // add is a convenience method of the Cache interface that AuthenticatedCache
  // does not implement. See add.
  async addAll(requests) {
    throw new Error("Cache.addAll is not supported by AuthenticatedCache");
  }

  // delete implements the delete method of the Cache interface
  async delete(request, options) {
    return await this.#cache.delete(request, options);
  }

  // keys implements the keys method of the Cache interface
  async keys(request, options) {
    return await this.#cache.keys(request, options);
  }

  // match implements the match method of the Cache interface
  async match(request, options) {
    const response = await this.#cache.match(request, options);
    if (response === undefined) {
      return undefined;
    }
    return await self.swerve.verifyResponse(response);
  }

  // matchAll implements the matchAll method of the Cache interface
  async matchAll(request, options) {
    const responses = await this.#cache.matchAll(request, options);
    return await Promise.allSettled(
      responses.map(response => self.swerve.verifyResponse(response)));
  }

  // put implements the put method of the Cache interface
  async put(request, response) {
    return await this.#cache.put(
      request, await self.swerve.tagResponse(response));
  }
}

// AuthenticatedCacheStorage is an implementation of the CacheStorage interface
// that performs automatic integrity checks on all cached values.
class AuthenticatedCacheStorage {
  #cacheStorage = null;

  constructor(cacheStorage) {
    this.#cacheStorage = cacheStorage;
  }

  // delete implements the delete method of the CacheStorage interface
  async delete(cacheName) {
    return await this.#cacheStorage.delete(cacheName);
  }

  // has implements the has method of the CacheStorage interface
  async has(cacheName) {
    return await this.#cacheStorage.has(cacheName);
  }

  // keys implements the keys method of the CacheStorage interface
  async keys() {
    return await this.#cacheStorage.keys();
  }

  // match is a convenience method of the CacheStorage interface that
  // AuthenticatedCacheStorage does not implement. As the authenticated cache
  // is highly security-sensitive and individual caches may have different
  // security properties, access to individual caches must be explicit.
  async match(request, options) {
    throw new Error(
      "CacheStorage.match is not supported by AuthenticatedCacheStorage");
  }

  // open implements the open method of the CacheStorage interface
  async open(cacheName) {
    return new AuthenticatedCache(await this.#cacheStorage.open(cacheName));
  }
}

class Swerve extends self.swerve.constructor {
  static #this = self.swerve = new this;

  // #init is set to true by the init method the first time it gets called
  static #init = false;

  // #config holds the current Swerve config. Any time it gets updated, the
  // updated config should also be persisted in the cache.
  static #config = {};

  // #clientFunctions is an array of functions whose source code is served as
  // part of the Swerve client library. See also registerClientLibrary and
  // #getClientLibrary.
  static #clientFunctions = [];

  static #getClientLibrary() {
    return new Response(
      Swerve.#clientFunctions
        .map(func => `(${func.toString()})();`)
        .join("\n"),
      { headers: { "Content-Type": "text/javascript" } });
  }

  // #handleFetchDefault implements the default handling of the forwarded fetch
  // event. It runs after all event listeners and can be prevented by calling
  // Event.prototype.preventDefault on the ForwardEvent instance.
  // 
  // The implementation never throws or responds to the event with
  // Response.error(), since that results in inconsistent behavior between
  // browsers. Instead the handler responds with an HTTP error response when an
  // error is encountered. Custom event listeners should follow this same rule.
  static #handleFetchDefault(event) {
    if (event.defaultPrevented) {
      return;
    }

    // TODO: should respondWith be wrapped in try-catch in case a custom handler
    // forgets to call preventDefault?
    event.respondWith((async () => {
      try {
        const url = new URL(event.original.request.url);

        if (url.origin === self.location.origin) {
          // Serve internal resources
          switch (url.pathname) {
          case "/swerve.client.js":
            console.debug("serving client library");
            return Swerve.#getClientLibrary();
          case "/swerve.config.json":
            console.debug("serving config");
            return new Response(JSON.stringify(Swerve.#config));
          }
        }

        // allow requests with safe destinations
        switch (event.original.request.destination) {
          case "": case "audio": case "font": case "image": case "manifest":
          case "report": case "style": case "track": case "video":
            console.debug(`serving '${url}' directly from the network (safe `
              + `destination '${event.original.request.destination}')`);
            return await fetch(event.original.request);
        }

        // Allow requests with SRI
        if (event.original.request.integrity) {
          console.debug(`serving '${url}' directly from the network (SRI)`);
          return await fetch(event.original.request);
        }

        // disallow non-SRI cross-origin requests with unsafe destinations
        // TODO: do we need to support CORS here?
        if (url.origin != self.location.origin) {
          console.warn(`refusing to serve cross-origin request '${url}'`);
          return new Response("Forbidden",
            { status: 403, statusText: "Forbidden" });
        }

        const response = await fetch(event.original.request);
        const hash = await self.swerve.computeSRI(response.clone());

        // Is this a new installation? If yes blindly trust the first response.
        if (installing) {
          console.debug(`installation complete, adding the response from `
            + `'${url}' to known hashes`);
          installing = false;
          await self.swerve.addKnownHash(hash, { reason: "install" });
        }

        if (hash in Swerve.#config.knownHashes) {
          console.debug(`serving '${url}' from the network (known hash)`);
          // Enforce COOP in every response. This way a cross-origin window
          // can't hold on to an opener reference and sneakily navigate to an
          // uncontrolled same-origin page.
          const headers = new Headers(response.headers);
          headers.set("Cross-Origin-Opener-Policy", "same-origin");
          return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: headers
          });
        }

        console.warn(
          `refusing to serve '${url}'; no matches in known hashes`);
        return self.swerve.errorResponse(
          new Error(`response from '${url}' did not match a known hash`));
      } catch (e) {
        console.error(e);
        return self.swerve.errorResponse(e);
      }

    })());
  }

  static {
    // Immediately below we register the Swerve client library. Although its
    // source code lives inside the core library, note that runs in a client
    // context and doesn't capture any surrounding local scopes present here.
    // Its global scope is the client scope. Unlike the scope of the core
    // library and its imports, the client scope is synchronous.
    Swerve.#this.registerClientLibrary(_ => {
      class Swerve {
        static #this = self.swerve = new Swerve();
        static #calls = { };

        // Hold on to the original controller. If the controller ever changes,
        // we immediately stop processing messages to avoid leaking unencrypted
        // data to a spoofed controller or accepting spoofed responses to
        // calls.
        // 
        // The original controller being already spoofed at this point is not
        // an issue because no data has yet been loaded to the app.
        static #controller = self.navigator.serviceWorker.controller;

        static {
          self.navigator.serviceWorker.addEventListener("message", event => {
            const { id, result, error } = event.data;
            if (event.source !== Swerve.#controller) {
              throw new Error(
                "controller changed, ignoring message from service worker");
            }
            if (error === undefined) {
              Swerve.#calls[id].resolve(result);
            } else {
              Swerve.#calls[id].reject(error);
            }
            delete Swerve.#calls[id];
          });
        }

        async #call(method, ...args) {
          if (Swerve.#controller !== self.navigator.serviceWorker.controller) {
            throw new Error(
              "controller changed, ignoring message to service worker");
          }
          const id = self.crypto.randomUUID();
          const promise = new Promise((resolve, reject) => {
            Swerve.#calls[id] = { resolve, reject };
          });
          Swerve.#controller.postMessage({ id, method, args });
          return await promise;
        }

        // ready is an async method that returns once the client singleton is
        // ready to be used. The default implementation here returns
        // immediately. Overriding ready allows a subclass to perform async
        // initialization before signaling the application that the client is
        // ready.
        async ready() {}

        async encrypt(data, additionalData) {
          return await this.#call("encrypt", data, additionalData);
        }

        async decrypt(data, additionalData) {
          return await this.#call("decrypt", data, additionalData);
        }
      }
    });

    // Handle RPC calls from the client
    Swerve.#this.addEventListener("message", ({ original: event }) => {
      event.waitUntil((async _ => {
        const controlledClients = await self.clients.matchAll();
        const allowedMethods = [ "encrypt", "decrypt"];
        const { id, method, args } = event.data;
        // only respond to controlled clients
        if (!controlledClients.some(client => client.id === event.source.id)) {
          return;
        }
        // only allow a safe subset of methods
        // TODO: make the allowlist configurable from subclasses
        if (!allowedMethods.includes(method)) {
          return;
        }
        try {
          const result = await self.swerve[method]
            .apply(self.swerve, args);
          event.source.postMessage({ id, result });
        } catch (error) {
          event.source.postMessage({ id, error });
        }
      })());
    });

    // set up default (overrideable) fetch handling
    Swerve.#this.addEventListener("fetch", event => {
      const wait = self.swerve.makeExtendable(event);
      // Queue the default handler as a microtask and wait for it to run. This
      // way any non-default handlers are run first and can use
      // Event.prototype.preventDefault to cancel the default behavior.
      event.original.waitUntil(
        Promise.resolve()
          .then(wait)
          .then(Swerve.#handleFetchDefault.bind(Swerve, event)));
    });

    // set up minimal (non-overrideable) fetch event filtering
    Swerve.#this.addEventListener("fetch", event => event.waitUntil((async _ => {
      try {
        // Detect uncontrolled clients and refuse to handle fetch events when
        // any exist. This code is racy because of the asynchronicity of
        // matchAll. That may result in false positive matches, i.e. throwing
        // when no uncontrolled clients actually exist. This is reasonable, as
        // it should be extremely rare and safe, only compromising the user
        // experience and not security.
        // 
        // TODO: make it possible to hook into this check, so that it's possible
        // to e.g. display a notification when the check fails
        const controlledClients = await self.clients.matchAll();
        const allClients = await self.clients.matchAll({
          includeUncontrolled: true
        });
        const controlledClientIDs = controlledClients.map(client => client.id);
        const allClientIDs = allClients.map(client => client.id);
        const uncontrolledClientIDs = allClientIDs.filter(
          id => !controlledClientIDs.includes(id));
        if (installing && uncontrolledClientIDs.length === 1) {
          // When installing, allow exactly one uncontrolled client. This client
          // is the one that initiated the install.
          return;
        }
        if (uncontrolledClientIDs.length === 0) {
          // All client IDs are in the list of controlled client IDs. Continue
          // processing the event normally.
          return;
        }
        throw new Error(
          `${uncontrolledClientIDs.length} uncontrolled client(s) found`);
      } catch(e) {
        console.error(e);
        event.preventDefault();
        event.stopImmediatePropagation();
        return new Response(null, { status: 204, statusText: "No Content"});
      }
    })()));

    Swerve.#this.addEventListener("activate", event => {
      if (installing && Swerve.#config.claimOnInstall) {
        console.debug("installation complete, claiming clients");
        installing = false;
        self.clients.claim();
      }
    });
  }

  // makeExtendable defines the waitUntil method on event, making event
  // implement the ExtendableEvent interface. It returns a function that returns
  // a promise which will only resolve once all event handling has completed.
  // The returned function should only be called once the initial synchronous
  // event handling has completed; otherwise the Promise resolves immediately.
  makeExtendable(event) {
    const extensions = [];
    event.waitUntil = promise => extensions.push(promise);
    return async function () {
      while ((await Promise.all(extensions)).length < extensions.length);
    };
  }

  // errorResponse returns a Response object corresponding to the object
  // (typically an Error instance) passed to it. It never throws; if it is
  // called with invalid arguments, it returns a Response object indicating that
  // error instead. Application code may override the errorResponse
  // implementation to perform custom error handling, but custom implementations
  // must adhere to the same constraints, i.e. they may never throw.
  errorResponse(error) {
    try {
      return new Response(
        `The application encountered an error. Details:\n\n${error}`,
        { status: 400, statusText: "Bad Request" });
    } catch {
      return new Response(
        "The application encountered an error. "
        + "Additionally, another error was encountered "
        + "while generating this message.",
        { status: 400, statusText: "Bad Request" });
    }
  }

  // registerClientLibrary registers a function whose source code will be
  // served as part of the Swerve client library, /swerve.client.js.
  // The method can be called multiple times to register multiple functions
  // that will all be used.
  registerClientLibrary(func) {
    Swerve.#clientFunctions.push(func);
  }

  // computeSRI returns the SRI hash corresponding to response
  async computeSRI(response, algorithm) {
    algorithm ??= "sha384";
    const hashes = { sha256: "SHA-256", sha384: "SHA-384", sha512: "SHA-512" };
    const ab = await crypto.subtle.digest(hashes[algorithm],
      await response.arrayBuffer());
    const fr = new FileReader();
    return await new Promise(resolve => {
      fr.addEventListener("load",
        _ => resolve(`${algorithm}-${btoa(fr.result)}`));
      fr.readAsBinaryString(new Blob([ ab ]));
    });
  }

  // compareSRI throws if the specified SRI hash does not match response 
  async compareSRI(response, hash) {
    const [ algorithm ] = hash.split("-");
    const actual = await this.computeSRI(response, algorithm);
    if (hash !== actual) {
      throw new Error(`integrity error: computed hash '${actual}' does not `
        + `match expected value '${hash}'`);
    }
  }

  // addKnownHash adds a hash and its info to known hashes. If the hash was
  // already known, no changes are made, the old info is kept, and the new info
  // is discarded.
  async addKnownHash(hash, info) {
    if (hash in Swerve.#config.knownHashes) {
      return;
    }
    Swerve.#config.knownHashes[hash] = info;
    const coreCache = await this.caches.open("swerve.core");
    await coreCache.put("/swerve.config.json",
      new Response(JSON.stringify(Swerve.#config)));
  }

  // fetch is a wrapper around the standard fetch API that routes requests
  // through all fetch listeners registered in the service worker, as if fetch
  // was called in a client context. Unlike the standard fetch API, it allows
  // specifying the the value of the destination property of the Request object
  // dispatched with the FetchEvent.
  async fetch(resource, options) {
    const request = new Request(resource, options);
    if (options?.destination) {
      const destination = options.destination;
      Object.defineProperty(request, "destination",
        { get() { return destination }});
    }
    const event = new FetchEvent("fetch", { request });
    const wait = this.makeExtendable(event);
    let result = undefined;
    event.respondWith = response => {
      if (result !== undefined) {
        throw new DOMException(undefined, "InvalidStateError");
      }
      result = response;
    };
    self.dispatchEvent(event);
    await wait();
    if (result === undefined) {
      result = fetch(resource, options);
    }
    return await result;
  }

  // caches is an AuthenticatedCacheStorage instance that wraps the global
  // CacheStorage instance.
  caches = new AuthenticatedCacheStorage(self.caches);

  // init is an async function that gets called after the constructor and
  // performs async initialization tasks that the constructor cannot.
  // Subclasses may override it but the overriding implementation must always
  // call await super.init() before performing its own initialization. The core
  // library waits for init to return before returning itself; calling await
  // this.ready() inside init blocks indefinitely.
  async init() {
    if (Swerve.#init) {
      return;
    }
    Swerve.#init = true;

    const coreCache = await this.caches.open("swerve.core");

    // Is this a new installation? Fetch and cache the config file.
    if (installing) {
      console.debug("fetching config to local cache");
      const response = await fetch("/swerve.config.json");
      await coreCache.put("/swerve.config.json", response);
    }

    // load the config from the cache
    Swerve.#config = await (async () => {
      const response = await coreCache.match("/swerve.config.json");
      return await response.json();
    })();
    Swerve.#config.knownHashes ??= {};

    // load imports
    for (let { path, code, config } of Swerve.#config.imports || []) {
      if (path) {
        console.debug(`importing '${path}'`);
      } else {
        console.debug(`importing anonymous import`);
      }
      if (!code && path) {
        if (installing) {
          console.debug(`caching import '${path}'`);
          const response = await fetch(path);
          await coreCache.put(path, response.clone());
          code = await response.text();
        } else {
          code = await (await coreCache.match(path)).text();
        }
      } else if (!code && !path) {
        throw new Error("no path or code specified for import");
      }
      const importfn = new async function () {}
        .constructor("installing", "config", code);
      await importfn(installing, config);
    }

    // call init again in case any of the imports has overridden it
    await self.swerve.init();
  }
};

await self.swerve.init();
