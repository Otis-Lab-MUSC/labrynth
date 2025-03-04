#ifndef LASER_UTILS_H
#define LASER_UTILS_H

#include <Arduino.h>    
#include "Laser.h"    

void manageLaser(Laser &laser);
void logStim(Laser &laser);
bool inStimPeriod(unsigned long int currentMillis);
void stim(Laser &laser, unsigned long int currentMillis);
void manageStim(Laser &laser);

#endif
