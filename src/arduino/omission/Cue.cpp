#include "Cue.h"
#include "Device.h"

Cue::Cue(byte initPin) : Device(initPin), running(false), frequency(8000), duration(1600) {}

void Cue::setRunning(bool initRunning) {
    running = initRunning;
}

void Cue::setFrequency(long int initFrequency) {
    frequency = initFrequency;
    Serial.println("SET CUE FREQUENCY TO: " + String(frequency));
}

void Cue::setDuration(long int initDuration) {
    duration = initDuration;
    Serial.println("SET CUE DURATION TO: " + String(duration));
}

void Cue::on() {
    tone(pin, frequency);
}

void Cue::off() {
    noTone(pin);
}

bool Cue::isRunning() const {
    return running;
}

long int Cue::getFrequency() const {
    return frequency;
}

long int Cue::getDuration() const {
    return duration;
}

void Cue::setOnTimestamp(long int currentTimestamp) {
    onTimestamp = currentTimestamp;
}

void Cue::setOffTimestamp(long int currentTimestamp) {
    offTimestamp = currentTimestamp + duration;
}

long int Cue::getOnTimestamp() const {
    return onTimestamp;
}

long int Cue::getOffTimestamp() const {
    return offTimestamp;
}
