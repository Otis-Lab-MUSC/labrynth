#ifndef LASER_H
#define LASER_H

#include "Device.h"
#include <Arduino.h>

// Enum to define the laser modes (oscillating or based on active press)
enum MODE { CYCLE, REWARD };
enum SETTING { OSCILLATE, CONSTANT };
enum STATE { ACTIVE, INACTIVE };
enum ACTION { ON, OFF };

class Laser : public Device {
private:
    unsigned long int duration;   // Total duration of the stimulation period (ms)
    unsigned long int frequency;  // Frequency of laser pulses (e.g., 40Hz)
    unsigned long int stimStart;
    unsigned long int stimEnd;
    unsigned long int halfCycleStart;
    unsigned long int halfCycleEnd;
    bool logged;
    MODE laserMode;
    SETTING laserSetting;
    STATE laserState;
    ACTION laserAction;

public:
    Laser(byte initPin);

    // Setters
    void setDuration(unsigned long int initDuration);
    void setFrequency(unsigned long int frequency);
    void setStimPeriod(unsigned long int currentMills);
    void setStimHalfCyclePeriod(unsigned long int currentMillis);
    void setStimLogged(bool log);
    void setStimMode(MODE mode);
    void setStimSetting(SETTING setting);
    void setStimState(STATE state);
    void setStimAction(ACTION action);

    // Getters
    unsigned long int getDuration();
    unsigned long int getFrequency();
    unsigned long int getStimStart();
    unsigned long int getStimEnd();
    unsigned long int getStimHalfCycleStart();
    unsigned long int getStimHalfCycleEnd();
    bool getStimLog();
    MODE getStimMode();
    SETTING getStimSetting();
    STATE getStimState();
    ACTION getStimAction();

    // Laser control
    void on();
    void off();
};

#endif // LASER_H
