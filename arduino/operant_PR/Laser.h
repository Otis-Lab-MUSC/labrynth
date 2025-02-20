#ifndef LASER_H
#define LASER_H

#include "Device.h"
#include <Arduino.h>

class Laser : public Device { // subclass of Device for lever switches
public:
    unsigned long int stimDuration;
    unsigned long int previousStim;
    bool isRunning;

    Laser(byte initPin);
    void setStimDuration(long int initDuration);
    void setPreviousStim(long int timestamp);
    void setIsRunning(bool initRunning);
    void on();
    void off();

    long int getPreviousStim();
    long int getStimDuration();
    bool getIsRunning();
};

#endif // LASER_H
