class TokenBucket {
    constructor(capacity, refillRate) {
        const parsedCapacity = Number(capacity);
        const parsedRefillRate = Number(refillRate);

        this.capacity = Number.isFinite(parsedCapacity) && parsedCapacity > 0 ? parsedCapacity : 5;
        this.refillRate = Number.isFinite(parsedRefillRate) && parsedRefillRate >= 0 ? parsedRefillRate : 1;
        this.tokens = this.capacity;
        this.lastRefillTimestamp = Date.now();
    }

    allowRequest() {
        const now = Date.now();
        const secondsPassed = (now - this.lastRefillTimestamp) / 1000;
        this.tokens = Math.min(this.capacity, this.tokens + secondsPassed * this.refillRate);
        this.lastRefillTimestamp = now;

        if (this.tokens >= 1) {
            this.tokens -= 1;
            return true;
        }

        return false;
    }
}

const bucket = new TokenBucket(process.env.CAPACITY, process.env.REFILL_RATE);
module.exports = bucket;


