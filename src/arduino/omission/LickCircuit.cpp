#include "LickCircuit.h"

LickCircuit::LickCircuit(byte initPin) : Device(initPin), previousLickState(LOW), stableLickState(LOW), lickTimestamp(0), releaseTimestamp(0) {}

void LickCircuit::setPreviousLickState(bool initState) {
    previousLickState = initState;
}

void LickCircuit::setStableLickState(bool state) {
    stableLickState = state;
}

void LickCircuit::setLickTouchTimestamp(long int initTimestamp) {
    lickTimestamp = initTimestamp;
}

void LickCircuit::setLickReleaseTimestamp(long int initTimestamp) {
    releaseTimestamp = initTimestamp;
}

bool LickCircuit::getPreviousLickState() const {
    return previousLickState;
}

bool LickCircuit::getStableLickState() const {
    return stableLickState;
}

long int LickCircuit::getLickTouchTimestamp() const {
    return lickTimestamp;
}

long int LickCircuit::getLickReleaseTimestamp() const {
    return releaseTimestamp;
}
