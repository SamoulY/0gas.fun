# GasFree SDK

A lightweight JavaScript library to embed GasFree’s gas‑abstraction + ad flow into any DApp.

## Usage
```html
<script src="https://your-server.com/gasfree.js?apiUrl=YOUR_BACKEND_URL"></script>
<script>
  document.getElementById('claim').onclick = async () => {
    const accounts = await ethereum.request({ method: 'eth_requestAccounts' });
    GasFree.start({
      userAddress: accounts[0],
      onSuccess: (result) => alert(`Received ${result.rewardAmount} DEV`),
      onError: (err) => alert(err.message)
    });
  };
</script>
```

## API
- `GasFree.init(options)` – Manually set options (optional).
- `GasFree.start(params)` – Start the verification flow.
