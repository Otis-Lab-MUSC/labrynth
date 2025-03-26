#ifndef LASER_H
#define LASER_H

#include "Device.h"
#include <Arduino.h>

class Laser : public Device { // subclass of Device for lever switches
public:
    unsigned long int onDuration;
    unsigned long int offDuration;
    unsigned long int onTimestamp;
    unsigned long int offTimestamp;
    String trigger;

    Laser(byte initPin);
    void setStim(long int initTimestamp);
    void setTrigger(String initTrigger);
    void setStimPeriod(long int initDuration, long int traceInterval);
    void setStimOnDuration(long int initDuration);
    void setStimOffDuration(long int initDuration);
    void setStimOnTimestamp(long int initTimestamp);
    void setStimOffTimestamp(long int initTimestamp);
    void on();
    void off();

    long int getStimOnTimestamp();
    long int getStimOffTimestamp();
    long int getStimDuration();
    String getTrigger();
};

#endif // LASER_H
