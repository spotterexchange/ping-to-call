-- Support Twilio API keys (recommended over the account Auth Token).
-- When api_key_sid_enc is set, REST calls authenticate as (API Key SID : secret)
-- while the Account SID is still used in the request URL. auth_token_enc holds the
-- API Key Secret in that case (or the legacy Auth Token when api_key_sid_enc is NULL).
ALTER TABLE twilio_config ADD COLUMN api_key_sid_enc TEXT;
