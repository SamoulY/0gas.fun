# GasFree SDK

Lightweight JavaScript SDK for GasFree challenge verification + ad-gated gas sponsorship.

## Usage

```html
<script src="https://your-server.com/gasfree.js?apiUrl=YOUR_BACKEND_URL"></script>
<script>
  document.getElementById('claim').onclick = async () => {
    const accounts = await ethereum.request({ method: 'eth_requestAccounts' });

    GasFree.start({
      userAddress: accounts[0],
      mode: 'standard', // 'standard' | 'data_collection'
      onSuccess: (result) => alert(`Received ${result.rewardAmount} DEV`),
      onError: (err) => alert(err.message)
    });
  };
</script>
```

## API

- `GasFree.init({ apiUrl })`
- `GasFree.start({ userAddress, mode, onSuccess, onError })`
