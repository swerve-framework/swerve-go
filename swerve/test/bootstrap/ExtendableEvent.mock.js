class MockExtendableEvent extends Event {
    static calls = { waitUntil: [] };

    constructor(type) {
        super(type);
    }

    waitUntil() {
        MockExtendableEvent.calls.waitUntil.push([...arguments]);
    }
}

self.ExtendableEvent = MockExtendableEvent;