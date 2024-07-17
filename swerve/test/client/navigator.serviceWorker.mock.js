class MockServiceWorker extends EventTarget {
  static calls = { register: [] };

  #resolveReady = null;
  ready = new Promise(resolve => { this.#resolveReady = resolve; });

  register() {
    MockServiceWorker.calls.register.push([...arguments]);
    this.addEventListener('controllerchange', _ => this.#resolveReady());
  }
}

Object.defineProperty(navigator, 'serviceWorker', {
  value: new MockServiceWorker()
});