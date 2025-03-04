#include "Laser.h"

Laser::Laser(byte initPin) : Device(initPin), duration(30000), frequency(20), stimStart(0), stimEnd(0), halfCycleStart(0), halfCycleEnd(0), logged(true), cycleUp(false), laserMode(CYCLE), laserState(INACTIVE), laserAction(OFF) {}

void Laser::setDuration(unsigned long int initDuration) {
  duration = initDuration * 1000;
}

void Laser::setFrequency(unsigned long int initFrequency) {
  frequency = initFrequency;
}

void Laser::setStimPeriod(unsigned long int currentMillis) {
  stimStart = currentMillis;
  stimEnd = currentMillis + duration;
}

void Laser::setStimHalfCyclePeriod(unsigned long int currentMillis) {
  float halfCycleLength = (1.0 / frequency) / 2.0 * 1000;
  halfCycleStart = currentMillis;
  halfCycleEnd = currentMillis + halfCycleLength;
}

void Laser::setStimLogged(bool log) {
  logged = log;
}

void Laser::setCycleUp(bool cycle) {
  cycleUp = cycle;
}

void Laser::setStimMode(MODE mode) {
  laserMode = mode;
}

void Laser::setStimState(STATE state) {
  laserState = state;
}

void Laser::setStimAction(ACTION action) {
  laserAction = action;
}

unsigned long int Laser::getDuration() {
  return duration;
}

unsigned long int Laser::getFrequency() {
  return frequency;
}

unsigned long int Laser::getStimStart() {
  return stimStart;
}

unsigned long int Laser::getStimEnd() {
  return stimEnd;
}

unsigned long int Laser::getStimHalfCycleStart() {
  return halfCycleStart;
}

unsigned long int Laser::getStimHalfCycleEnd() {
  return halfCycleEnd;
}

bool Laser::getStimLog() {
  return logged;
}

bool Laser::getCycleUp() {
  return cycleUp;
}

MODE Laser::getStimMode() {
  return laserMode;
}

STATE Laser::getStimState() {
  return laserState;
}

ACTION Laser::getStimAction() {
  return laserAction;
}

void Laser::on() {
  digitalWrite(pin, HIGH);  // Turn the laser ON
//  Serial.println("ON, " + String(laserAction) + ", " + String(cycleUp) + ", " + String(laserState)); // Uncomment for debugging
}

void Laser::off() {
  digitalWrite(pin, LOW);   // Turn the laser OFF
//  Serial.println("OFF, " + String(laserAction) + ", " + String(cycleUp) + ", " + String(laserState)); // Uncomment for debugging
}
