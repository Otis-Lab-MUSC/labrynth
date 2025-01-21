#ifndef LASER_H
#define LASER_H

#include "Device.h"
#include <Arduino.h>

// Enum to define the laser modes (oscillating or based on active press)
enum StimMode { CYCLE, REWARD };
enum StimState { ACTIVE, INACTIVE };
enum LaserMode { OSCILLATE, CONSTANT };
enum LaserState { ON, OFF };

class Laser : public Device {
private:
    unsigned long int duration;   // Total duration of the stimulation period (ms)
    unsigned long int frequency;  // Frequency of laser pulses (e.g., 40Hz)
    unsigned long int previousStim;   // Timestamp of the last pulse
    unsigned long int rewardStimEndTimestamp;
    unsigned long int previousHalfCycle;
    unsigned long stimStartTimestamp; // Stores when the laser turns ON
    unsigned long stimEndTimestamp;   // Stores when the laser turns OFF
    StimMode stimMode;
    StimState stimState;
    LaserMode laserMode;
    LaserState laserState;

public:
    Laser(byte initPin);

    // Setters
    void setDuration(unsigned long int initDuration);
    void setFrequency(unsigned long int frequency);
    void setPreviousStim(unsigned long int timestamp);
    void setPreviousHalfCycle(unsigned long int timestamp);
    void setRewardStimEndTimestamp(unsigned long int timestamp);
    void setStimMode(StimMode mode);
    void setStimState(StimState state);
    void setLaserMode(LaserMode mode);
    void setLaserState(LaserState state);
    void setStimStartTimestamp(unsigned long int timestamp);
    void setStimEndTimestamp(unsigned long int timestamp);

    // Getters
    unsigned long int getDuration();
    unsigned long int getFrequency();
    unsigned long int getPreviousStim();
    unsigned long int getPreviousHalfCycle();
    unsigned long int getRewardStimEndTimestamp();
    unsigned long int getStimStartTimestamp() const;
    unsigned long int getStimEndTimestamp() const;
    StimMode getStimMode();
    StimState getStimState();
    LaserMode getLaserMode();
    LaserState getLaserState();

    // Laser control
    void on();
    void off();
};

#endif // LASER_H
