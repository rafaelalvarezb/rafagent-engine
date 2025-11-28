import cron from 'node-cron';
import { runAgent } from './agent';
import { storage } from '../storage';
import { isWithinWorkingHours, getWorkingHoursFromConfig } from '../utils/workingHours';

let currentCronJob: cron.ScheduledTask | null = null;

export function startAgentScheduler() {
  console.log('🤖 Starting agent scheduler...');
  
  // Run initial check
  checkAndRunAgent();
  
  // Set up interval to check for configuration changes every minute
  setInterval(async () => {
    await checkAndRunAgent();
  }, 60000); // Check every minute
}

async function checkAndRunAgent() {
  try {
    // Get all users
    const users = await storage.getAllUsers();
    
    for (const user of users) {
      const config = await storage.getUserConfig(user.id);
      if (!config) continue;
      
      const workingHours = getWorkingHoursFromConfig(config);
      
      // Check if we're within working hours
      if (!isWithinWorkingHours(workingHours)) {
        console.log(`⏰ Skipping agent run for user ${user.email} - outside working hours`);
        continue;
      }
      
      // Check if it's time to run the agent based on frequency
      const shouldRun = await shouldRunAgent(user.id, config.agentFrequencyHours);
      if (!shouldRun) {
        console.log(`⏰ Skipping agent run for user ${user.email} - not time yet (frequency: ${config.agentFrequencyHours}h)`);
        continue;
      }
      
      console.log(`🚀 Running agent for user ${user.email} (frequency: ${config.agentFrequencyHours}h)`);
      
      try {
        const result = await runAgent(user.id);
        console.log(`✅ Agent completed for user ${user.email}:`, result);
        
        // Update last run time
        await storage.updateUserConfig(user.id, {
          lastAgentRun: new Date()
        });
        
      } catch (error) {
        console.error(`❌ Agent error for user ${user.email}:`, error);
      }
    }
  } catch (error) {
    console.error('❌ Scheduler error:', error);
  }
}

async function shouldRunAgent(userId: string, frequencyHours: number): Promise<boolean> {
  try {
    const config = await storage.getUserConfig(userId);
    if (!config || !config.lastAgentRun) {
      return true; // First run
    }
    
    const lastRun = new Date(config.lastAgentRun);
    const now = new Date();
    const hoursSinceLastRun = (now.getTime() - lastRun.getTime()) / (1000 * 60 * 60);
    
    return hoursSinceLastRun >= frequencyHours;
  } catch (error) {
    console.error('Error checking agent run time:', error);
    return false;
  }
}

export function stopAgentScheduler() {
  if (currentCronJob) {
    currentCronJob.stop();
    currentCronJob = null;
  }
  console.log('🛑 Agent scheduler stopped');
}
