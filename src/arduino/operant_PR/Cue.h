#ifndef CUE_H
#define CUE_H

#include "Device.h"
#include <Arduino.h>

class Cue : public Device { // subclass of Device for cue speakers
public:
    bool running; // Boolean variable to denote if the cue is playing a tone or not
    long int frequency; // the frequency that the cue speaker will play the tone at
    long int duration; // the length of time that the tone will be played for
    long int onTimestamp; // Add these
    long int offTimestamp; // Add these

    Cue(byte initPin);
    void setRunning(bool initRunning);
    void setFrequency(long int initFrequency);
    void setDuration(long int initDuration);
    void on();
    void off();
    bool isRunning() const;
    long int getFrequency() const;
    long int getDuration() const;
    void setOnTimestamp(long int currentTimestamp); 
    void setOffTimestamp(long int currentTimestamp);
    long int getOnTimestamp() const;
    long int getOffTimestamp() const;
};

#endif // CUE_H

