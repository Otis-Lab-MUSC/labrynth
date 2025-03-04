#include "Laser.h"
#include "Device.h"

Laser::Laser(byte initPin) : Device(initPin), stimDuration(30000), previousStim(0), isRunning(false) {}

void Laser::setStimDuration(long int initDuration) { 
  stimDuration = initDuration;
}

void Laser::setPreviousStim(long int timestamp) {
  previousStim = timestamp;
}

void Laser::setIsRunning(bool initRunning) {
  isRunning = initRunning;
}

void Laser::on() { 
   digitalWrite(pin, HIGH); 
}

void Laser::off() { 
   digitalWrite(pin, LOW); 
}

long int Laser::getPreviousStim() { return previousStim; }
long int Laser::getStimDuration() { return stimDuration; }
bool Laser::getIsRunning() { return isRunning; }
