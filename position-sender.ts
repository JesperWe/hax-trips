import { wsconnect } from "@nats-io/nats-core"

// Define the position message type
type PositionMessage = {
    id: number;
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

// Initialize array of trips with IDs 0-9 and random vendors
const trips: PositionMessage[] = Array.from({ length: 10 }, (_, i) => ({
    id: i,
    vendor: Math.random() > 0.5 ? 0 : 1,
    lat: MIN_LAT + Math.random() * (MAX_LAT - MIN_LAT),
    lng: MIN_LNG + Math.random() * (MAX_LNG - MIN_LNG),
    timestamp: Date.now()
}))

// Function to generate random position within bounds
function getRandomPosition(): { lat: number; lng: number } {
    const lat = MIN_LAT + Math.random() * (MAX_LAT - MIN_LAT)
    const lng = MIN_LNG + Math.random() * (MAX_LNG - MIN_LNG)
    return { lat, lng }
}

// Main function to connect and send messages
async function sendPositions() {
    try {
        // Connect to NATS
        console.log('Connecting to NATS...')
        const nc = await wsconnect({ servers: 'http://nats.hax.journeyman.se:8080' })
        console.log('Connected to NATS')

        // Send position message every second
        setInterval(() => {
            // Pick a random trip to update
            const randomIndex = Math.floor(Math.random() * trips.length)
            const position = getRandomPosition()

            // Update only lat, lng, and timestamp for the selected trip
            trips[randomIndex].lat = position.lat
            trips[randomIndex].lng = position.lng
            trips[randomIndex].timestamp = Date.now()

            // Publish the updated message
            nc.publish('positions', new TextEncoder().encode(JSON.stringify(trips[randomIndex])))
            console.log(`Sent position: ${JSON.stringify(trips[randomIndex])}`)
        }, 300)

        // Keep the process running
        console.log('Sending positions every second. Press Ctrl+C to stop.')
    } catch (err) {
        console.error('Error:', err)
        process.exit(1)
    }
}

// Start sending positions
sendPositions()