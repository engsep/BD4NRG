// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.7.0 <0.9.0;

/**
 * @title Monitoring Data Notarization
 * @author Alessandro Rossi
 * @dev Notarization of monitoring data into the Blockchain through the hash of their dump at each timeslot.
 * @custom:dev-run-script ./scripts/send_to_replit_(MDN).ts
 */
contract MonitoringDataNotarization {

    struct Measurement {
        string label; // unencrypted metadata (e.g., query, Influx tags, json or array of attributes, etc.) 
        bytes32 hash; // encoded monitoring data (e.g., dump, Influx fields, json or array of values, ect.)
    }

    mapping (address => mapping (uint => Measurement)) private measurements; // (provider, timestamp) -> {label, hash}
    uint16 private timeslot;
    address private owner;

    event Notarized(uint, Measurement);

    constructor(uint16 timeslotInSeconds) {
        owner = msg.sender;
        timeslot = timeslotInSeconds; // e.g., 900 = 15 minutes
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner authorized");
        _;
    }

    // ---------------
    // ADMIN FUNCTIONS (READ-ONLY and TRANSACTIONAL)
    // ---------------

    /// @dev Force the notarization of a monitoring data hash for a given data provider at a given unckecked timestamp
    function addMeasurement(address provider, uint timestamp, string calldata label, bytes32 hash) 
            external onlyOwner returns (uint, Measurement memory) {
        measurements[provider][timestamp] = Measurement(label, hash);

        emit Notarized(timestamp, measurements[provider][timestamp]);
        return (timestamp, measurements[provider][timestamp]); // works only if called by a contract, use events externally
    }

    /// @dev Get the Measurement notarized for a given data provider at a given timestamp
    function getMeasurement(address provider, uint timestamp)
            external onlyOwner view returns (Measurement memory) { 
        return measurements[provider][timestamp];
    }

    // ----------------
    // HELPER FUNCTIONS (READ-ONLY)
    // ----------------

    /// @dev Calculate the monitoring data hash with Keccak 256 (SHA-3) algorithm
    function createHash(string calldata data)
            public pure returns (bytes32 hash) {
        return keccak256(abi.encodePacked(data));
    }

    /// @dev Get the established timeslot duration
    function getTimeslotDuration() 
            external view returns (uint16 inSeconds) {
        return timeslot;
    }

    /// @dev Get the current timestamp
    function getTimestamp()
            public view returns (uint inSeconds) {
        return block.timestamp;
    }

    /// @dev Set the timestamp to the preceding timeslot (e.g., 01:23:45 --> 01:15:00, if timeslot=15 min) 
    function normalize(uint timestamp)
            public view returns (uint inSeconds) {
        return timestamp / timeslot * timeslot;
    }

    // ----------------------
    // VERIFICATION FUNCTIONS (READ-ONLY)
    // ----------------------

    /// @dev Check if a monitoring data hash has been notarized at the given timestamp
    function check(uint timestamp, bytes32 hash)
            public view returns (bool) {
        require(hash != "", "Hash cannot be null");
        require(measurements[msg.sender][timestamp].hash != "", "No data notarized at that timestamp");
        require(timestamp > 0 && timestamp % timeslot == 0, "Timestamp must be normalized");

        return measurements[msg.sender][timestamp].hash == hash;
    }

    /// @dev Verify if monitoring data have been notarized at the current noromalized timestamp
    function test(string calldata data)
            external view returns (bool) {
        return verify(normalize(getTimestamp()), data);
    }

    /// @dev Calculate and check if a monitoring data hash has been notarized at the given timestamp
    function verify(uint timestamp, string calldata data)
            public view returns (bool) {
        return check(timestamp, createHash(data));
    }

    // ----------------------
    // NOTARIZATION FUNCTIONS (TRANSACTIONAL)
    // ----------------------

    /// @dev Calculate and register the hash of monitoring data, normalizing the current timestamp
    function notarize(string calldata label, string calldata data) 
            external returns (uint timestamp, Measurement memory) {
        return register(normalize(getTimestamp()), label, createHash(data));
    }

    /// @dev Notarize a hash, timestamp must be normalized and not already used
    function register(uint timestamp, string calldata label, bytes32 hash) 
            public returns (uint, Measurement memory) {
        require(hash != "", "Hash cannot be null");
        require(measurements[msg.sender][timestamp].hash == "", "Data already notarized");
        require(timestamp > 0 && timestamp % timeslot == 0, "Timestamp must be normalized");

        measurements[msg.sender][timestamp] = Measurement(label, hash);

        emit Notarized(timestamp, measurements[msg.sender][timestamp]);
        return (timestamp, measurements[msg.sender][timestamp]); // works only if called internally, use events externally
    }
}