import {wsconnect} from "@nats-io/nats-core"

// Define the position message type
type PositionMessage = {
    id: string;
    vendor: number;
    lat: number;
    lng: number;
    timestamp: number;
};

// Define the landCover area bounds (from app.tsx)
const MIN_LNG = -74.02
const MAX_LNG = -74.0
const MIN_LAT = 40.7
const MAX_LAT = 40.72

// Function to generate random position within bounds
function getRandomPosition(): { lat: number; lng: number } {
    const lat = MIN_LAT + Math.random() * (MAX_LAT - MIN_LAT)
    const lng = MIN_LNG + Math.random() * (MAX_LNG - MIN_LNG)
    return {lat, lng}
}

// Main function to connect and send messages
async function sendPositions() {
    try {
        // Connect to NATS
        console.log('Connecting to NATS...')
        const nc = await wsconnect({servers: 'http://nats.hax.journeyman.se:8080'})
        console.log('Connected to NATS')

        // Send position message every second
        setInterval(() => {
            const position = getRandomPosition()
            const message: PositionMessage = {
                id: 'trip_17',
                vendor: Math.random() > 0.5 ? 0 : 1, // Randomly assign vendor 0 or 1
                lat: position.lat,
                lng: position.lng,
                timestamp: Date.now()
            }

            // Publish the message
            nc.publish('positions', new TextEncoder().encode(JSON.stringify(message)))
            console.log(`Sent position: ${JSON.stringify(message)}`)
        }, 1000)

        // Keep the process running
        console.log('Sending positions every second. Press Ctrl+C to stop.')
    } catch (err) {
        console.error('Error:', err)
        process.exit(1)
    }
}

// Start sending positions
sendPositions()