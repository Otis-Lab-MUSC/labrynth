#ifndef PUMP_H
#define PUMP_H

#include "Device.h"
#include <Arduino.h>

class Pump : public Device { // subclass of Device for pumps
public:
  bool running; // Boolean variable to denote if the pump is running or not
  long int infusionDuration; // the length of time in milliseconds to disperse the infusion over
    float infusionAmount;
    float motorRPMs;
    long int infusionStartTimestamp;
    long int infusionEndTimestamp;

    Pump(byte initPin);
    void setRunning(bool initRunning);
    void setInfusionDuration(long int initDuration);
    void setInfusionAmount(float initAmount);
    void setMotorRPMs(float initRPMs);
    void setInfusionPeriod(long int cueOffTimestamp, long int traceInterval);
    void on();
    void off();
    bool isRunning() const;
    long int getInfusionDuration() const;
    float getInfusionAmount() const;
    float getMotorRPMs() const;
    long int getInfusionStartTimestamp() const;
    long int getInfusionEndTimestamp() const;

};

#endif // PUMP_H
