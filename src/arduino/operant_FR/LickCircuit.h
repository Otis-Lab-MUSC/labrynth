#ifndef LICKCIRCUIT_H
#define LICKCIRCUIT_H

#include "Arduino.h"
#include "Device.h"

class LickCircuit : public Device {
private:
    bool previousLickState;
    bool stableLickState;  // Added to keep track of the debounced state
    long int lickTimestamp;
    long int releaseTimestamp;

public:
    LickCircuit(byte initPin);

    void setPreviousLickState(bool initState);
    void setStableLickState(bool state);  // New method to set the stable state
    void setLickTouchTimestamp(long int initTimesstamp);
    void setLickReleaseTimestamp(long int initTimestamp);

    bool getPreviousLickState() const;
    bool getStableLickState() const;      // New method to get the stable state
    long int getLickTouchTimestamp() const;
    long int getLickReleaseTimestamp() const;
};

#endif



