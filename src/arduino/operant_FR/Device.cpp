#include "Device.h"
#include <Arduino.h>

Device::Device(byte initPin) : pin(initPin), armed(false) {}

void Device::arm() {
    armed = true;
    Serial.print("DEVICE ARMED AT PIN: ");
    Serial.println(pin);
}

void Device::disarm() {
    armed = false;
    Serial.print("DEVICE DISARMED AT PIN: ");
    Serial.println(pin);
}

byte Device::getPin() const { return pin; }
bool Device::isArmed() const { return armed; }
