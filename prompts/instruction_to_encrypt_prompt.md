## JSON format
The prompt need to be a json file in the following format:
```
{
    "content": "<the prompt text>"
}
```

## Encryption
Encrypt the json file using:
```
openssl enc -aes-256-cbc -salt -pbkdf2 -in prompt.json -out encrypted_prompt.enc
```
Add a password when requested.
Observation: 
1. The out file name must be encrypted_prompt.enc
2. The password must be added as an environment variable named PROMPT_DECRYPT_KEY

## File upload
Upload the file to an url. Right now I am using irlab.uncg.edu/resources/
```
cp encrypted_prompt.enc jggrandi@irlab.uncg.edu:/home/jggrandi
```

ssh into the server and move the file to the correct location.
##
