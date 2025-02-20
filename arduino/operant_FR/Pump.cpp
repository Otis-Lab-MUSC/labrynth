#include "Pump.h"
#include "Device.h"
#include <Arduino.h>

Pump::Pump(byte initPin) : Device(initPin), running(false), infusionDuration(2000), infusionAmount(0), motorRPMs(0), infusionStartTimestamp(0), infusionEndTimestamp(0) {}

void Pump::setRunning(bool initRunning) {
    running = initRunning;
}

void Pump::setInfusionDuration(long int initDuration) {
    infusionDuration = initDuration;
}

void Pump::setInfusionAmount(float initAmount) {
    infusionAmount = initAmount;
}

void Pump::setMotorRPMs(float initRPMs) {
    motorRPMs = initRPMs;
}

void Pump::setInfusionPeriod(long int cueOffTimestamp, long int traceInterval) {
    infusionStartTimestamp = cueOffTimestamp + traceInterval;
    infusionEndTimestamp = infusionStartTimestamp + infusionDuration;
}

void Pump::on() {
    digitalWrite(pin, HIGH);
}

void Pump::off() {
    digitalWrite(pin, LOW);
}

bool Pump::isRunning() const {
    return running;
}

long int Pump::getInfusionDuration() const {
    return infusionDuration;
}

float Pump::getInfusionAmount() const {
    return infusionAmount;
}

float Pump::getMotorRPMs() const {
    return motorRPMs;
}

long int Pump::getInfusionStartTimestamp() const {
    return infusionStartTimestamp;
}

long int Pump::getInfusionEndTimestamp() const {
    return infusionEndTimestamp;
}
