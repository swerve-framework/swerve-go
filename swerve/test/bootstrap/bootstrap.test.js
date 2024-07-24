QUnit.test('swerve.ready() returns after an install event', async assert => {
    self.dispatchEvent(new MockExtendableEvent('install'));
    assert.equal(MockExtendableEvent.calls.waitUntil.length, 1,
        'ExtendableEvent.waitUntil is called exactly once for the install event');
    // the Promise passed to waitUntil should not reject
    await MockExtendableEvent.calls.waitUntil[0][0];
    await swerve.ready();
});

QUnit.test('swerve.encrypt() encrypts correctly', async assert => {
    await swerve.ready();

    {
        const ciphertext = await swerve.encrypt(
            new Uint8Array([ 1, 2, 3, 4, 5 ]));
        const binaryString = 
            [ ...new Uint8Array(await ciphertext.arrayBuffer()) ]
            .map(byte => String.fromCharCode(byte)).join("");
        assert.equal(btoa(binaryString),
            'BAQEBAQEBAQEBAQEjwfHuIR1Zvx4XcTD4gqDSfTLRBZz',
            'the ciphertext matches the precomputed value');
    }
    
    {
        const ciphertext = await swerve.encrypt(
            new Uint8Array([ 1, 2, 3, 4, 5 ]),
            new Uint8Array([ 6, 7, 8, 9, 0 ]));
        const binaryString = [ ...new Uint8Array(await ciphertext.arrayBuffer()) ]
            .map(byte => String.fromCharCode(byte)).join("");
        assert.equal(btoa(binaryString), 'BAQEBAQEBAQEBAQEjwfHuITwEyxgNADlvo8qiF0/qUNx',
            'the ciphertext matches the precomputed value');
    }
});

QUnit.test('swerve.decrypt() decrypts correctly', async assert => {
    await swerve.ready();

    {
        const binaryString = atob('BAQEBAQEBAQEBAQEjwfHuIR1Zvx4XcTD4gqDSfTLRBZz');
        const ciphertext = Uint8Array.from(binaryString, s => s.charCodeAt(0));
        const plaintext = await swerve.decrypt(ciphertext);
        assert.deepEqual(new Uint8Array(plaintext),
            new Uint8Array([ 1, 2, 3, 4, 5 ]),
            'the decrypted plaintext matches the expected value');
    }
    
    {
        const binaryString = atob('BAQEBAQEBAQEBAQEjwfHuITwEyxgNADlvo8qiF0/qUNx');
        const ciphertext = Uint8Array.from(binaryString, s => s.charCodeAt(0));
        const plaintext = await swerve.decrypt(ciphertext,
            new Uint8Array([ 6, 7, 8, 9, 0 ]));
        assert.deepEqual(new Uint8Array(plaintext),
            new Uint8Array([ 1, 2, 3, 4, 5 ]),
            'the decrypted plaintext matches the expected value');
    }
});
