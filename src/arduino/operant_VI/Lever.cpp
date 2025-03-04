#include "Lever.h"

Lever::Lever(byte initPin) : Device(initPin), previousLeverState(HIGH), stableLeverState(HIGH), pressTimestamp(0), releaseTimestamp(0), orientation(""), pressType("NO CONDITION"), intervalStartTime(0), randomInterval(0), activePressOccurred(false) {}

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

void Lever::resetInterval() {
    intervalStartTime = millis();
    randomInterval = random(0, 15000);
    activePressOccurred = false;
}

void Lever::setActivePressOccurred(bool state) { 
  activePressOccurred = state; 
}

bool Lever::getPreviousLeverState() const {
    return previousLeverState;
}

bool Lever::getStableLeverState() const {
    return stableLeverState;
}

bool Lever::getActivePressOccurred() { 
  return activePressOccurred; 
}

long int Lever::getPressTimestamp() const {
    return pressTimestamp;
}

long int Lever::getReleaseTimestamp() const {
    return releaseTimestamp;
}

unsigned long Lever::getIntervalStartTime() { 
  return intervalStartTime; 
}

unsigned long Lever::getRandomInterval() { 
  return randomInterval; 
}

String Lever::getOrientation() const {
    return orientation;
}

String Lever::getPressType() const {
    return pressType;
}