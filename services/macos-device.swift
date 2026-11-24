import Foundation
import Security
import CryptoKit

// Source prototype: compile and verify on a signed Apple Silicon build before distribution.
enum DeviceFailure: Error { case failed(String) }
let keyTag = Data("PSDLingo.Device.mac.v1".utf8)
let secretService = "PSDLingo.Secrets.mac.v1"
let aad = Data("PSDLingo.Secrets.mac.v1".utf8)
func check(_ status: OSStatus) throws {
    guard status == errSecSuccess else { throw DeviceFailure.failed("keychain status \(status)") }
}
func privateKey() throws -> SecKey {
    let query: [String: Any] = [kSecClass as String: kSecClassKey,
        kSecAttrApplicationTag as String: keyTag, kSecAttrKeyType as String: kSecAttrKeyTypeECSECPrimeRandom,
        kSecAttrKeyClass as String: kSecAttrKeyClassPrivate, kSecReturnRef as String: true,
        kSecUseDataProtectionKeychain as String: true]
    var item: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &item)
    if status == errSecSuccess { return item as! SecKey }
    guard status == errSecItemNotFound else { try check(status); throw DeviceFailure.failed("key lookup") }
    var error: Unmanaged<CFError>?
    guard let access = SecAccessControlCreateWithFlags(nil, kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
        .privateKeyUsage, &error) else { throw DeviceFailure.failed("access control") }
    let attributes: [String: Any] = [kSecAttrKeyType as String: kSecAttrKeyTypeECSECPrimeRandom,
        kSecAttrKeySizeInBits as String: 256, kSecAttrTokenID as String: kSecAttrTokenIDSecureEnclave,
        kSecUseDataProtectionKeychain as String: true,
        kSecPrivateKeyAttrs as String: [kSecAttrIsPermanent as String: true,
            kSecAttrApplicationTag as String: keyTag, kSecAttrAccessControl as String: access]]
    guard let key = SecKeyCreateRandomKey(attributes as CFDictionary, &error) else {
        // No software-key fallback: do not silently weaken the device identity.
        throw DeviceFailure.failed("Secure Enclave key creation")
    }
    return key
}
func encryptionKey(create: Bool) throws -> SymmetricKey {
    let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: secretService, kSecAttrAccount as String: "aes-gcm-v1",
        kSecAttrSynchronizable as String: false, kSecUseDataProtectionKeychain as String: true]
    var lookup = query
    lookup[kSecReturnData as String] = true
    var item: CFTypeRef?
    let status = SecItemCopyMatching(lookup as CFDictionary, &item)
    if status == errSecSuccess {
        guard let bytes = item as? Data, bytes.count == 32 else { throw DeviceFailure.failed("invalid encryption key") }
        return SymmetricKey(data: bytes)
    }
    guard status == errSecItemNotFound && create else { try check(status); throw DeviceFailure.failed("key missing") }
    let key = SymmetricKey(size: .bits256)
    var add = query
    add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
    add[kSecValueData as String] = key.withUnsafeBytes { Data($0) }
    let added = SecItemAdd(add as CFDictionary, nil)
    if added == errSecDuplicateItem { return try encryptionKey(create: false) }
    try check(added)
    return key
}
func decode(_ value: String?, limit: Int = 512 * 1024) throws -> Data {
    guard let value = value, let data = Data(base64Encoded: value), data.count <= limit else {
        throw DeviceFailure.failed("invalid base64")
    }
    return data
}
func execute(_ request: [String: String]) throws -> [String: String] {
    switch request["op"] {
    case "identity":
        var error: Unmanaged<CFError>?
        guard let publicKey = SecKeyCopyPublicKey(try privateKey()),
              let raw = SecKeyCopyExternalRepresentation(publicKey, &error) as Data?, raw.count == 65 else {
            throw DeviceFailure.failed("public key")
        }
        let parsedPublic = try P256.Signing.PublicKey(x963Representation: raw)
        return ["spki": parsedPublic.derRepresentation.base64EncodedString()]
    case "sign":
        var error: Unmanaged<CFError>?
        guard let der = SecKeyCreateSignature(try privateKey(), .ecdsaSignatureMessageX962SHA256,
            try decode(request["value"]) as CFData, &error) as Data? else { throw DeviceFailure.failed("sign") }
        let signature = try P256.Signing.ECDSASignature(derRepresentation: der)
        return ["signature": signature.rawRepresentation.base64EncodedString()]
    case "protect":
        let box = try AES.GCM.seal(decode(request["value"]), using: encryptionKey(create: true), authenticating: aad)
        guard let combined = box.combined else { throw DeviceFailure.failed("seal") }
        return ["value": "mac-keychain-v1:" + combined.base64EncodedString()]
    case "unprotect":
        guard let value = request["value"], value.hasPrefix("mac-keychain-v1:") else {
            throw DeviceFailure.failed("unsupported ciphertext")
        }
        let bytes = try decode(String(value.dropFirst("mac-keychain-v1:".count)), limit: 512 * 1024 + 28)
        let box = try AES.GCM.SealedBox(combined: bytes)
        let plain = try AES.GCM.open(box, using: encryptionKey(create: false), authenticating: aad)
        return ["value": plain.base64EncodedString()]
    default: throw DeviceFailure.failed("unsupported operation")
    }
}
do {
    // Bound input even when a caller is faulty; stdout carries only the JSON response.
    var input = Data()
    while true {
        let part = FileHandle.standardInput.readData(ofLength: 4096)
        if part.isEmpty { break }
        input.append(part)
        guard input.count <= 1024 * 1024 else { throw DeviceFailure.failed("request size") }
    }
    guard let request = try JSONSerialization.jsonObject(with: input) as? [String: String] else {
        throw DeviceFailure.failed("invalid request")
    }
    let response = try JSONSerialization.data(withJSONObject: execute(request), options: [.sortedKeys])
    FileHandle.standardOutput.write(response)
    FileHandle.standardOutput.write(Data([10]))
} catch {
    FileHandle.standardError.write(Data("Mac device operation failed; check Keychain and helper signing.\n".utf8))
    exit(1)
}
