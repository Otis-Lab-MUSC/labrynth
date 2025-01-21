#include "Lever.h"

Lever::Lever(byte initPin) : Device(initPin), previousLeverState(HIGH), stableLeverState(HIGH), pressTimestamp(0), releaseTimestamp(0), orientation(""), pressType("NO CONDITION") {}

void Lever::setPreviousLeverState(bool initState) {
    previousLeverState = initState;
}

void Lever::setStableLeverState(bool state) {
    stableLeverState = state;
}

void Lever::setPressTimestamp(long int initTimestamp) {
    pressTimestamp = initTimestamp;
}

void Lever::setReleaseTimestamp(long int initTimestamp) {
    releaseTimestamp = initTimestamp;
}

void Lever::setOrientation(String initOrientation) {
    orientation = initOrientation;
}

void Lever::setPressType(String initPressType) {
    pressType = initPressType;
}

bool Lever::getPreviousLeverState() const {
    return previousLeverState;
}

bool Lever::getStableLeverState() const {
    return stableLeverState;
}

long int Lever::getPressTimestamp() const {
    return pressTimestamp;
}

long int Lever::getReleaseTimestamp() const {
    return releaseTimestamp;
}

String Lever::getOrientation() const {
    return orientation;
}

String Lever::getPressType() const {
    return pressType;
}
