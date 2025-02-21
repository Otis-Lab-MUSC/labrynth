#ifndef PROGRAM_UTILS_H
#define PROGRAM_UTILS_H

#include <Arduino.h> 
#include "Device.h"
#include "Lever.h"
#include "Laser.h"
#include "Pump.h"
#include "Cue.h"


void startProgram(byte pin);
void endProgram(byte pin);
void deliverReward(Lever *&lever, Cue *cue, Pump *pump, Laser *laser);

#endif
