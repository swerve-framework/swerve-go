QUnit.test('swerve.ready() returns after an install event', async assert => {
    self.dispatchEvent(new MockExtendableEvent('install'));
    assert.equal(MockExtendableEvent.calls.waitUntil.length, 1,
        'ExtendableEvent.waitUntil is called exactly once for the install event');
    // the Promise passed to waitUntil should not reject
    await MockExtendableEvent.calls.waitUntil[0][0];
    await swerve.ready();
});
