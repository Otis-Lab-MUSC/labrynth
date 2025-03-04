#ifndef CUE_UTILS_H
#define CUE_UTILS_H

#include <Arduino.h> 
#include "Cue.h"     
 
void connectionJingle(String connected, Cue &cue, bool &linkedToGUI);
void manageCue(Cue *cue);

#endif
