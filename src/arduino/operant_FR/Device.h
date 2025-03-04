#ifndef DEVICE_H 
#define DEVICE_H

#include <Arduino.h>

class Device { 
protected:
  const byte pin; // pin on Arduino to be used for the device
  bool armed; // serves as a limiter to when a device can transmit data

public:
    Device(byte pin);
    virtual void arm();
    virtual void disarm();
    byte getPin() const;
    bool isArmed() const;
};

#endif 
