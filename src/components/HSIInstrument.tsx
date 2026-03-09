import React, { useMemo } from 'react';
import { motion } from 'motion/react';

interface HSIInstrumentProps {
  obs: number;
  bearing: number; // Radial from station to aircraft
  distance: number; // DME in meters
  heading: number; // Aircraft heading
  headingBug: number; // Heading bug setting
}

export const HSIInstrument: React.FC<HSIInstrumentProps> = ({ obs, bearing, distance, heading, headingBug }) => {
  // CDI Calculation
  // bearing: Radial FROM station TO aircraft
  // obs: Selected course
  
  // 1. Calculate the shortest difference between the radial and the OBS
  const diff = useMemo(() => {
    let d = (bearing - obs + 540) % 360 - 180;
    return d;
  }, [obs, bearing]);

  // 2. Determine TO/FROM
  // If the difference is within 90 degrees, we are in the FROM sector
  const isFrom = Math.abs(diff) <= 90;
  const isTo = !isFrom;

  // 3. Calculate CDI Deflection
  // In an HSI, the CDI bar shows the position of the COURSE line relative to the aircraft.
  // If we are on the 100 radial and OBS is 090 (FROM), we are to the RIGHT of the course.
  // The needle should deflect LEFT to tell us to fly left.
  // If we are on the 100 radial and OBS is 270 (TO), we are to the LEFT of the course.
  // The needle should deflect RIGHT.
  
  const cdiDeflection = useMemo(() => {
    let dev = diff;
    if (isTo) {
      // If in TO sector, we calculate deviation relative to the reciprocal course
      dev = (bearing - ((obs + 180) % 360) + 540) % 360 - 180;
      // In TO mode, if radial > reciprocal_obs, we are LEFT of the course line
      // Example: Radial 100, OBS 270 (Recip 090). 100 > 90, we are left of the 270 line.
      // So needle should go RIGHT (positive x).
      return Math.max(-10, Math.min(10, dev)) * 1;
    } else {
      // In FROM mode, if radial > obs, we are RIGHT of the course line.
      // Example: Radial 100, OBS 090. 100 > 90, we are right of the 090 line.
      // So needle should go LEFT (negative x).
      return Math.max(-10, Math.min(10, dev)) * -1;
    }
  }, [diff, isTo, bearing, obs]);

  return (
    <div className="relative w-72 h-72 bg-[#1a1a1a] rounded-full border-4 border-[#333] shadow-2xl flex items-center justify-center overflow-hidden select-none">
      {/* Rotating Compass Card (Rotates with Heading) */}
      <motion.div 
        className="absolute inset-0 flex items-center justify-center"
        animate={{ rotate: -heading }}
        transition={{ type: 'spring', stiffness: 40, damping: 12 }}
      >
        {[...Array(36)].map((_, i) => {
          const angle = i * 10;
          const isMajor = i % 3 === 0;
          return (
            <div 
              key={i} 
              className="absolute h-full w-full flex flex-col items-center"
              style={{ transform: `rotate(${angle}deg)` }}
            >
              <div className={`w-0.5 ${isMajor ? 'h-5 bg-white' : 'h-2 bg-gray-500'}`} />
              {isMajor && (
                <span className="text-[12px] text-white font-bold mt-1">
                  {i === 0 ? 'N' : i === 9 ? 'E' : i === 18 ? 'S' : i === 27 ? 'W' : i}
                </span>
              )}
            </div>
          );
        })}

        {/* OBS Arrow (Rotates with Heading + OBS) */}
        {/* The arrow points to the selected OBS on the compass card */}
        <div 
          className="absolute inset-0 flex items-center justify-center pointer-events-none"
          style={{ transform: `rotate(${obs}deg)` }}
        >
          {/* Main Arrow Head */}
          <div className="absolute top-6 w-0 h-0 border-l-[10px] border-l-transparent border-r-[10px] border-r-transparent border-b-[20px] border-b-yellow-400" />
          {/* Arrow Shaft (Top part) */}
          <div className="absolute top-10 w-1.5 h-12 bg-yellow-400" />
          {/* Arrow Shaft (Bottom part) */}
          <div className="absolute bottom-10 w-1.5 h-12 bg-yellow-400" />
          
          {/* CDI Bar (The sliding part) */}
          <motion.div 
            className="absolute w-1.5 h-24 bg-yellow-400 z-10"
            animate={{ x: cdiDeflection * 4 }} // 4px per degree
            transition={{ 
              type: 'spring', 
              stiffness: 15, // Lower stiffness = slower movement
              damping: 20,    // Higher damping = less oscillation
              mass: 2        // Higher mass = more inertia
            }}
          />

          {/* CDI Scale Dots (Relative to OBS Arrow) */}
          <div className="absolute flex gap-4 items-center">
            {[-10, -8, -6, -4, -2, 2, 4, 6, 8, 10].map(d => (
              <div key={d} className="w-1.5 h-1.5 rounded-full bg-gray-600" />
            ))}
          </div>

          {/* TO/FROM Indicator (Relative to OBS Arrow) */}
          <div className="absolute top-24 flex flex-col items-center">
             <div className={`w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[10px] ${isTo ? 'border-b-white' : 'border-b-transparent'}`} />
             <div className={`w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[10px] ${isFrom ? 'border-t-white' : 'border-t-transparent'}`} />
          </div>
        </div>

        {/* Heading Bug (Rotates with Compass Card) */}
        <div 
          className="absolute inset-0 flex items-center justify-center pointer-events-none"
          style={{ transform: `rotate(${headingBug}deg)` }}
        >
          <div className="absolute top-0 w-4 h-3 bg-orange-500 rounded-sm border border-black/50" 
               style={{ clipPath: 'polygon(0% 0%, 100% 0%, 100% 100%, 80% 100%, 80% 40%, 20% 40%, 20% 100%, 0% 100%)' }} />
        </div>
      </motion.div>

      {/* Fixed Lubber Line (Top) */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1 h-6 bg-orange-500 z-30 shadow-sm" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-t-[12px] border-t-orange-500 z-30" />

      {/* Miniature Aircraft (Fixed in Center) */}
      <div className="absolute z-40 pointer-events-none flex flex-col items-center">
        {/* Wings */}
        <div className="w-16 h-1.5 bg-white rounded-full" />
        {/* Fuselage */}
        <div className="w-2 h-12 bg-white rounded-full -mt-6" />
        {/* Tail */}
        <div className="w-6 h-1 bg-white rounded-full -mt-2" />
      </div>

    </div>
  );
};
