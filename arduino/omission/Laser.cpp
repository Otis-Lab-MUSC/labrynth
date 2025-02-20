#include "Laser.h"
#include "Device.h"

Laser::Laser(byte initPin) : Device(initPin), onDuration(2000), offDuration(3000), onTimestamp(), offTimestamp(0), trigger("ON-PRESS") {}

void Laser:: setStim(long int initTimestamp) {
    onTimestamp = initTimestamp;
    offTimestamp = initTimestamp + onDuration;
}

void Laser::setTrigger(String initTrigger) { trigger = initTrigger; }

void Laser::setStimOnDuration(long int initDuration) { 
  onDuration = initDuration;
}

void Laser::setStimOffDuration(long int initDuration) { 
  offDuration = initDuration;
}

void Laser::setStimPeriod(long initTimestamp, long int traceInterval) {
    onTimestamp = initTimestamp + traceInterval;
    offTimestamp = onTimestamp + onDuration;
}


void Laser::on() { 
  // digitialWrite(initPin, HIGH); 
  Serial.println("LASER ON");
}

void Laser::off() { 
  // digitalWrite(initPin, LOW); 
}

long int Laser::getStimOnTimestamp() { return onTimestamp; }

long int Laser::getStimOffTimestamp() { return offTimestamp; }

long int Laser::getStimDuration() { return onDuration; }

String Laser::getTrigger() { return trigger; }
