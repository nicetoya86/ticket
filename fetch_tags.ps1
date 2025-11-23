$headers = @{ 'X-Access-Key'='691c02fd8863a23c0811'; 'X-Access-Secret'='41d2534bd2215993628fd817b3b0fae8' }
$res = Invoke-RestMethod -Uri 'https://api.channel.io/open/v5/user-chats?startDate=2025-11-01&endDate=2025-11-17&limit=200' -Headers $headers
$res | ConvertTo-Json -Depth 5 | Set-Content userChats.json -Encoding utf8
