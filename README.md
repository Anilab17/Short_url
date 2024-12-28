# Short_url
Creating short url and redirect to there original url.

API Documentation

1. User Login with there Email:

    URL: https://url-shortner.mooo.com/
    Description: Login There email address authenticate themselves using Google Sign-on only.

2. Create Short URL API:

      URL: https://url-shortner.mooo.com/api/shorten
      Methods: POST
      Body:{
             longUrl,
             topic
          }
     Description: This API will generate a Short url while send the long url and This API will generate a concise link that redirects to the original to original url.
    * Add the rate limit for this api only we can create the api only for 5 times within 1 min.

3.Get the short url API:
    URL: https://url-shortner.mooo.com/api/shorten/:id?userid
     In parameter we need to pass alias id and pass the login user id in Query.
     Description: Get the Short url link details based on short url id or alias and while hit this url important since that time dependent on analytics apis. 
      * Add the rate limit for this api while hit this api this will be provide the api response only 10 times within 10 mins

4.Get the Analytics API:

     URL: https://url-shortner.mooo.com/api/analytics/:id
     Description: Get the analytics details for the specific short URL, it’s have total clicks and unique users and date.

5. Get the Analytics details based on topic:

    URL: https://url-shortner.mooo.com/api/analytics/topic/:id
    Description: Retrieve the analytics for all short urls grouped under specific topics based on the topic categories.


6. Get the overall analytics API:
    URL: https://url-shortner.mooo.com/api/analytics1/overall
    Description: Retrieve overall analytics details for all short urls created by authenticated user.


7. Get the Authenticated Users details:
  
    URL: https://url-shortner.mooo.com/getusers
    Description: Retrieve all the Authenticated users details with there details.



