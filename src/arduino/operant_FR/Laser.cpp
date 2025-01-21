#include "Laser.h"

Laser::Laser(byte initPin) : Device(initPin), duration(3000), frequency(1), previousStim(0), rewardStimEndTimestamp(0), previousHalfCycle(0), stimMode(CYCLE), stimState(ACTIVE), laserMode(OSCILLATE), laserState(ON) {}

void Laser::setDuration(unsigned long int initDuration) {
    duration = initDuration;
}

void Laser::setFrequency(unsigned long int initFrequency) {
    frequency = initFrequency;
}

void Laser::setPreviousStim(unsigned long int timestamp) {
    previousStim = timestamp;
}

void Laser::setPreviousHalfCycle(unsigned long int timestamp) {
    previousHalfCycle = timestamp;
}

void Laser::setStimMode(StimMode mode) {
  stimMode = mode;
}

void Laser::setStimState(StimState state) {
  stimState = state;
}

void Laser::setRewardStimEndTimestamp(unsigned long int timestamp) {
  rewardStimEndTimestamp = timestamp + duration;
}

void Laser::setStimStartTimestamp(unsigned long int timestamp) {
    stimStartTimestamp = timestamp;
}

void Laser::setStimEndTimestamp(unsigned long int timestamp) {
    stimEndTimestamp = timestamp;
}

void Laser::setLaserMode(LaserMode mode) {
    laserMode = mode;
}

void Laser::setLaserState(LaserState state) {
  laserState = state;
}

unsigned long int Laser::getDuration() {
    return duration;
}

unsigned long int Laser::getFrequency() {
    return frequency;
}

unsigned long int Laser::getPreviousStim() {
    return previousStim;
}

unsigned long int Laser::getPreviousHalfCycle() {
  return previousHalfCycle;
}

StimMode Laser::getStimMode() {
  return stimMode;
}

StimState Laser::getStimState() {
  return stimState;
}

unsigned long int Laser::getRewardStimEndTimestamp() {
  return rewardStimEndTimestamp;
}

unsigned long int Laser::getStimStartTimestamp() const {
    return stimStartTimestamp;
}

unsigned long int Laser::getStimEndTimestamp() const {
    return stimEndTimestamp;
}

LaserMode Laser::getLaserMode() {
  return laserMode;
}

LaserState Laser::getLaserState() {
  return laserState;
}

void Laser::on() {
    digitalWrite(pin, HIGH);  // Turn the laser ON
    // Serial.println("ON");
}

void Laser::off() {
    digitalWrite(pin, LOW);   // Turn the laser OFF
    // Serial.println("OFF");
}
