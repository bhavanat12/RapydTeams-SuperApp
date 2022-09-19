const axios = require("axios");
const querystring = require("querystring");
const { TeamsActivityHandler, CardFactory, TurnContext, MessageFactory, BotFrameworkAdapter, TeamsInfo} = require("botbuilder");
const rawDonationCard = require("./adaptiveCards/donation.json");
const rawUploadLearnCard = require("./adaptiveCards/uploadform.json");
const rawBuyCard = require("./adaptiveCards/buy.json");
const rawFormCard = require("./adaptiveCards/form.json");
const rawReimbursementDispCard = require("./adaptiveCards/reimbursementdisplay.json");
const rawReimbursementCard = require("./adaptiveCards/reimbursementform.json");
const cardTools = require("@microsoft/adaptivecards-tools");
const api = require('./rapyd_utils');
const utilities = require('./b64');

class TeamsBot extends TeamsActivityHandler {
  constructor() {
    super();

    this.baseUrl = 'https://TeamsRapydBackend.abhishekreddypa.repl.co'; //Replit hosted backend to handle task module/Rapyd operations
    
    this.onMessage(async (context, next) => {
      let txt = context.activity.text;
      const removedMentionText = TurnContext.removeRecipientMention(
        context.activity
      );
      if (removedMentionText) {
        // Remove the line break
        txt = removedMentionText.toLowerCase().replace(/\n|\r/g, "").trim();
      }

      // Trigger command by IM text
      switch (txt) {
        case "donate": {

          let parse_obj = await api.makeRequest('GET', '/v1/data/currencies').then((resp)=>{
            return resp.body.data
          })
  
          let donate_obj = {}
          donate_obj.data = parse_obj

          const card = cardTools.AdaptiveCards.declare(rawFormCard).render({"data": parse_obj});
          await context.sendActivity({ attachments: [CardFactory.adaptiveCard(card)] });
          break;
        }
        case "shop": {
          const card = cardTools.AdaptiveCards.declare(rawUploadLearnCard).render({
            "button": "Submit Inventory Data",
            "heading": "Setup Inventory to share with Team",
            "description": "Upload data related to products here - price, description and image if any.",
            "value": "12345"
          });
          await context.sendActivity({ attachments: [CardFactory.adaptiveCard(card)] });
          break;
        }
        case "reimb":{
          const card = cardTools.AdaptiveCards.declareWithoutData(rawReimbursementCard).render();
          await context.sendActivity({ attachments: [CardFactory.adaptiveCard(card)] });
          break;
        }
      }

      // By calling next() you ensure that the next BotHandler is run.
      await next();
    });

    // Listen to MembersAdded event, view https://docs.microsoft.com/en-us/microsoftteams/platform/resources/bot-v3/bots-notifications for more events
    this.onMembersAdded(async (context, next) => {
      const membersAdded = context.activity.membersAdded;
      for (let cnt = 0; cnt < membersAdded.length; cnt++) {
        if (membersAdded[cnt].id) {
          const card = cardTools.AdaptiveCards.declareWithoutData(rawDonationCard).render();
          await context.sendActivity({ attachments: [CardFactory.adaptiveCard(card)] });
          break;
        }
      }
      await next();
    });
  }

  async handleTeamsTaskModuleFetch(context, taskModuleRequest) {
    // Called when the user selects an options from the displayed HeroCard or
    // AdaptiveCard.  The result is the action to perform.

    const cardTaskFetchValue = taskModuleRequest.data;
    console.log(taskModuleRequest.data);
    if('amount' in cardTaskFetchValue){
      let body = {}
      if('donatestr' in cardTaskFetchValue)
      {
          body={
            requested_currency:JSON.parse(cardTaskFetchValue.donatestr).currency,
            currency: cardTaskFetchValue.country,
            country: "US",
            payment_method_type_categories: [
              "card"
            ],
            amount:cardTaskFetchValue.amount
          };
      }
      else
      {
        body={
          currency: "USD",
          country: "US",
          payment_method_type_categories: [
            "card"
          ],
          amount:cardTaskFetchValue.amount
        };
      }
      
        if("wallet" in taskModuleRequest.data && taskModuleRequest.data.wallet!="${wallet_id}"){
          body.ewallet = taskModuleRequest.data.wallet
        }
        else if ("fellowEmployees" in JSON.parse(cardTaskFetchValue.reimbdata))
        {
          const empList = JSON.parse(cardTaskFetchValue.reimbdata)["fellowEmployees"]
          empList.push(context.activity.from.aadObjectId)
          
          let finalPayees = [];
          let wallet_id = "";

          for (var i = 0; i < empList.length; i++) 
          {
            let find_wallets = await api.makeRequest('GET', '/v1/user/wallets?type=person&ewallet_reference_id=' + empList[i]).then((resp)=>{
              return resp.body.data
            })
            console.log(find_wallets)
            if(find_wallets.length == 0){
              let payload = {
                ewallet_reference_id: empList[i],
                first_name: context.activity.from.name.split(" ")[0],
                last_name: context.activity.from.name.split(" ")[1]
              }
              console.log(payload)
              let new_wallet = await api.makeRequest('POST', '/v1/user', payload).then((resp)=>{
                return resp
              })
              console.log(new_wallet.body.data.id)
              wallet_id = new_wallet.body.data.id
            }
            else{
              wallet_id = find_wallets[0].id
            }

            finalPayees.push({ewallet: wallet_id, amount: JSON.parse(cardTaskFetchValue.reimbdata)["amount"]/JSON.parse(cardTaskFetchValue.reimbdata)["fellowEmployeesCount"]})
          }
          body.ewallet = finalPayees
          }
        else if("byid" in JSON.parse(taskModuleRequest.data.reimbdata))
        {
          console.log("***** First Elseif *****************");
            let jsonReqData = JSON.parse(taskModuleRequest.data.reimbdata)
            let refId = jsonReqData.byid
            let find_wallets = await api.makeRequest('GET', '/v1/user/wallets?type=person&ewallet_reference_id=' + refId).then((resp)=>{
              return resp.body.data
            })
            let wallet_id = ""
            if(find_wallets.length == 0){
              let payload = {
                ewallet_reference_id: refId,
                first_name: context.activity.from.name.split(" ")[0],
                last_name: context.activity.from.name.split(" ")[1]
              }
              let new_wallet = await api.makeRequest('POST', '/v1/user', payload).then((resp)=>{
                return resp
              })
              console.log(new_wallet.body.data.id)
              wallet_id = new_wallet.body.data.id
            }
            else{
              wallet_id = find_wallets[0].id
            }
            body.ewallet = wallet_id
        }
        
      console.log(body)
      let checkout_id = await api.makeRequest('POST', '/v1/checkout', body).then((response) => {
        if (response.body){
          return response.body.data.id
        }
      });
      var payload
      if('reimbdata' in cardTaskFetchValue){
        payload = {
          url: this.baseUrl + '/checkout/'+ checkout_id + '?reimbapprove=' + cardTaskFetchValue.reimbdata,
          fallbackUrl: this.baseUrl + '/checkout/'+ checkout_id + '?reimbapprove=' + cardTaskFetchValue.reimbdata
        }
      }
      else{
        payload = {
          url: this.baseUrl + '/checkout/'+ checkout_id + '?donatestr=' + cardTaskFetchValue.donatestr,
          fallbackUrl: this.baseUrl + '/checkout/'+ checkout_id + '?donatestr=' + cardTaskFetchValue.donatestr
        }
      }
      return {
        task: {
          title: "Pay via Rapyd",
          type: 'continue',
          value: payload,
          height: 'large',
          width: 'large'
        }};  
    }
    else if ('messageId' in cardTaskFetchValue){
      if(cardTaskFetchValue.messageId == '12345'){
        return {
          task: {
            title: "Buy",
            type: 'continue',
            value: {
              url: this.baseUrl,
              fallbackUrl: this.baseUrl
            },
            height: 'large',
            width: 'large'
          }};    
      }
      else{
        return {
          task: {
            title: "Buy",
            type: 'continue',
            value: {
              url: this.baseUrl + '/?reimbinfo=' + cardTaskFetchValue.messageId,
              fallbackUrl: this.baseUrl + '/?reimbinfo=' + cardTaskFetchValue.messageId
            },
            height: 'large',
            width: 'large'
          }};
      }
    }
    else{
      let cart_data = []
      const full_data = JSON.parse(cardTaskFetchValue.data)
      let amount = 0
      for (const [key, value] of Object.entries(cardTaskFetchValue)){
        if (key == "type" || key == "data" || key == "reimbinfo"){
          continue
        }
        else{
          if(value == "true"){
            amount += +full_data[key].price
            cart_data.push({
              name: full_data[key].subject,
              amount: +full_data[key].price,
              quantity: 1,
              image: "https://rapydattach.blob.core.windows.net/rapyd-attachments/" + full_data[key].attachment
            })
          }
        }
      }
      let body={
        currency:'USD',
        country:'US',
        amount:amount,
        cart_items:cart_data
      }
      let checkout_id = await api.makeRequest('POST', '/v1/checkout', body).then((response) => {
        if (response.body){
          return response.body.data.id
        }
      });
      return {
        task: {
          title: "Pay via Rapyd",
          type: 'continue',
          value: {
            url: this.baseUrl + '/checkout_shop/' + checkout_id,
            fallbackUrl: this.baseUrl + '/checkout_shop/'+ checkout_id
          },
          height: 'large',
          width: 'large'
        }};  
    }
  }

  async handleTeamsTaskModuleSubmit(context, taskModuleRequest) {
    // Called when data is being returned from the selected option (see `handleTeamsTaskModuleFetch').

    let payment_info = taskModuleRequest.data
    if ('metadata' in payment_info){
      if('shop' in payment_info.metadata){
        return {
          // TaskModuleMessageResponse
          task: {
              type: 'message',
              value: 'Thank you for purchasing!'
          }
        }
      }
      else if('reimbapprove' in payment_info.metadata){
        var reimbcard_data = JSON.parse(payment_info.metadata.reimbapprove)
        let yourDate = new Date()
        const offset = yourDate.getTimezoneOffset()
        yourDate = new Date(yourDate.getTime() - (offset*60*1000))
        reimbcard_data.history.push({"text":"Expense approved and reimbursed by **"+ context.activity.from.name +"** on "+ yourDate.toISOString().split('T')[0]})
        reimbcard_data.by = "finance"
        reimbcard_data.status = "Completed"
        reimbcard_data.status_url = "https://rapydattach.blob.core.windows.net/rapyd-attachments/completed.jpg"
        reimbcard_data.show = false
        reimbcard_data.tostr = JSON.stringify(reimbcard_data)
        const card = cardTools.AdaptiveCards.declare(rawReimbursementDispCard).render(reimbcard_data);
        await context.updateActivity({
          type: "message",
          id: context.activity.conversation.id.split("=")[1],
          attachments: [CardFactory.adaptiveCard(card)],
        })
        return {
          // TaskModuleMessageResponse
          task: {
              type: 'message',
              value: 'Successful Payment'
          }
      };
      }
      let card_data = JSON.parse(payment_info.metadata.donatestr)
      card_data.wallet_id = taskModuleRequest.data.ewallets[0].ewallet
      card_data.raised = +card_data.raised + +payment_info.amount
      card_data.donatestr = JSON.stringify(card_data)
      await context.sendActivity(MessageFactory.text(payment_info.payment_method_data.name + " contributed an amount of " + payment_info.amount + " " + payment_info.currency_code + " to the fundraiser."));
      const card = cardTools.AdaptiveCards.declare(rawDonationCard).render(card_data);
      await context.updateActivity({
        type: "message",
        id: context.activity.conversation.id.split("=")[1],
        attachments: [CardFactory.adaptiveCard(card)],
      })
      return {
          // TaskModuleMessageResponse
          task: {
              type: 'message',
              value: 'Thank you for contributing!'
          }
      };
    }
    else if('reimbinfo' in payment_info && payment_info.reimbinfo !== ""){
      var itemsData = taskModuleRequest.data;
      var reimbinfo_card = JSON.parse(itemsData.reimbinfo.replace(/&quot;/g, '\"'));
      console.log(reimbinfo_card)
      let yourDate = new Date()
      const offset = yourDate.getTimezoneOffset()
      yourDate = new Date(yourDate.getTime() - (offset*60*1000))
      var parse_obj = [];
      for(var i=0; i<Object.keys(itemsData).length-1; i++)
      {
        parse_obj.push(taskModuleRequest.data[String(i)]);
      }
      const newcontext = {
        conversation: {
          id: '19:c6abfdca17ea4f0d801de1094c27c6cb@thread.tacv2'
        },
        serviceUrl : "https://smba.trafficmanager.net/amer/"
      }
      await context.adapter.continueConversation(newcontext, async(contex) =>{
        var reimbcard_data = 
        {
          "title": reimbinfo_card.title,
          "from": reimbinfo_card.from,
          "to": reimbinfo_card.to,
          "amount": reimbinfo_card.amount,
          "byname": reimbinfo_card.byname,
          "byid": reimbinfo_card.byid,
          "today": yourDate.toISOString().split('T')[0],
          "status" : "Pending",
          "status_url" : "https://adaptivecards.io/content/pending.png",
          "bills": parse_obj,
          "by": "manager",
          "fellowEmployees": reimbinfo_card.peoplePickerEmployees.split(','),
          "fellowEmployeesCount": reimbinfo_card.peoplePickerEmployees.split(',').length + 1,
          "history":[{"text":"Expense submitted by **"+ reimbinfo_card.byname +"** on "+ yourDate.toISOString().split('T')[0]}],
          "show": true
        }
        reimbcard_data.tostr = JSON.stringify(reimbcard_data)
        const card = cardTools.AdaptiveCards.declare(rawReimbursementDispCard).render(reimbcard_data);
        await contex.sendActivity({ attachments: [CardFactory.adaptiveCard(card)] });
      })
      await context.sendActivity(MessageFactory.text("Reimbursement application titled " + reimbinfo_card.title +" has been shared with the concerned Team."));
      return { statusCode: 200 };
    }
    else{
      var itemsData = taskModuleRequest.data;
      var parse_obj = [];
      for(var i=0; i<Object.keys(itemsData).length; i++)
      {
        parse_obj.push(taskModuleRequest.data[String(i)]);
      }
      const newcontext = {
        conversation: {
          id: "19:c6abfdca17ea4f0d801de1094c27c6cb@thread.tacv2"
        },
        serviceUrl : "https://smba.trafficmanager.net/amer/"
      }
      console.log(parse_obj)
      await context.adapter.continueConversation(newcontext, async(contex) =>{
        const card = cardTools.AdaptiveCards.declare(rawBuyCard).render(
          {
            "data": parse_obj,
            "instring": JSON.stringify(parse_obj)
          });
        await contex.sendActivity({ attachments: [CardFactory.adaptiveCard(card)] });
      })
      await context.sendActivity(MessageFactory.text("Information has been shared with your concerned Team."));
      return { statusCode: 200 };
    }
    
  }
  // Invoked when an action is taken on an Adaptive Card. The Adaptive Card sends an event to the Bot and this
  // method handles that event.
  async onAdaptiveCardInvoke(context, invokeValue) {
    if (invokeValue.action.verb === "donate") {  
      let wallet_id = "";
      if (invokeValue.action.data.type == 1){
        let find_wallets = await api.makeRequest('GET', '/v1/user/wallets?type=person&ewallet_reference_id=' + context.activity.from.aadObjectId).then((resp)=>{
          return resp.body.data[0]
        })
        console.log(find_wallets);
        if(find_wallets.length == 0){
          let payload = {
            ewallet_reference_id: context.activity.from.aadObjectId,
            first_name: context.activity.from.name.split(" ")[0],
            last_name: context.activity.from.name.split(" ")[1]
          }
          let new_wallet = await api.makeRequest('POST', '/v1/user', payload).then((resp)=>{
            return resp
          })
          wallet_id = new_wallet.id
        }
        else{
          wallet_id = find_wallets.id
        }
      }
      console.log("******************")
      console.log(wallet_id)
      console.log("******************")
      const newcontext = {
        conversation: {
          id: "19:c6abfdca17ea4f0d801de1094c27c6cb@thread.tacv2"
        },
        serviceUrl : "https://smba.trafficmanager.net/amer/"
      }
      await context.adapter.continueConversation(newcontext, async(contex) =>{
        var donate_obj = invokeValue.action.data
        donate_obj.wallet_id = wallet_id
        if(invokeValue.action.data.type == "1"){
          donate_obj.donation_type = "Personal"
        }
        else{
          donate_obj.donation_type = "Company"
        }
        donate_obj.by = context.activity.from.name
        donate_obj.donatestr = JSON.stringify(donate_obj)

        let parse_obj = await api.makeRequest('GET', '/v1/data/countries').then((resp)=>{
          return resp.body.data
        })

        donate_obj.data = parse_obj

        const card = cardTools.AdaptiveCards.declare(rawDonationCard).render(donate_obj);
        await contex.sendActivity({ attachments: [CardFactory.adaptiveCard(card)] });
      })
      const card = CardFactory.heroCard(
        'The fundraiser information has been shared with the Team',
        null
        );
      card.id = context.activity.replyToId;
      const message = MessageFactory.attachment(card);
      message.id = context.activity.replyToId;
      await context.updateActivity(message);
      return { statusCode: 200 };
    }
    else if(invokeValue.action.verb === "addbill"){
      invokeValue.action.data.byname = context.activity.from.name
      invokeValue.action.data.byid = context.activity.from.aadObjectId
      const card = cardTools.AdaptiveCards.declare(rawUploadLearnCard).render({
        "button": "Submit Bills",
        "heading": "Billing Information",
        "description": "Submit Information to share with finance team and manager to move forward with reimbursement process.",
        "value": JSON.stringify(invokeValue.action.data)
      });
      await context.updateActivity({
        type: "message",
        id: context.activity.replyToId,
        attachments: [CardFactory.adaptiveCard(card)],
      });
      return { statusCode: 200 };
    }
    else if(invokeValue.action.verb === "manager_approve"){
      const newcontext = {
        conversation: {
          id:'19:5444654394d545fc9fdc586ad387b77e@thread.tacv2'
        },
        serviceUrl : "https://smba.trafficmanager.net/amer/"
      }
      var reimbcard_data;
      await context.adapter.continueConversation(newcontext, async(contex) =>{
        reimbcard_data = JSON.parse(invokeValue.action.data.tostr)
        let yourDate = new Date()
        const offset = yourDate.getTimezoneOffset()
        yourDate = new Date(yourDate.getTime() - (offset*60*1000))
        reimbcard_data.history.push({"text":"Expense approved by **"+ context.activity.from.name +"** on "+ yourDate.toISOString().split('T')[0]})
        reimbcard_data.by = "finance"
        reimbcard_data.show = true
        reimbcard_data.tostr = JSON.stringify(reimbcard_data)
        const card = cardTools.AdaptiveCards.declare(rawReimbursementDispCard).render(reimbcard_data);
        await contex.sendActivity({ attachments: [CardFactory.adaptiveCard(card)] });
      })
      reimbcard_data.show = false
      reimbcard_data.tostr = JSON.stringify(reimbcard_data)
      const card = cardTools.AdaptiveCards.declare(rawReimbursementDispCard).render(reimbcard_data);
        await context.updateActivity({
          type: "message",
          id: context.activity.replyToId,
          attachments: [CardFactory.adaptiveCard(card)],
        })
      await context.sendActivity(MessageFactory.text("Reimbursement application titled " + reimbcard_data.title +" has been approved and shared with the finance Team."));
      return { statusCode: 200 };
      
    }
  }

  // Messaging extension Code
  // Action.
  handleTeamsMessagingExtensionSubmitAction(context, action) {
    switch (action.commandId) {
      case "createCard":
        return createCardCommand(context, action);
      case "shareMessage":
        return shareMessageCommand(context, action);
      default:
        throw new Error("NotImplemented");
    }
  }

  // Search.
  async handleTeamsMessagingExtensionQuery(context, query) {
    const searchQuery = query.parameters[0].value;
    const response = await axios.get(
      `http://registry.npmjs.com/-/v1/search?${querystring.stringify({
        text: searchQuery,
        size: 8,
      })}`
    );

    const attachments = [];
    response.data.objects.forEach((obj) => {
      const heroCard = CardFactory.heroCard(obj.package.name);
      const preview = CardFactory.heroCard(obj.package.name);
      preview.content.tap = {
        type: "invoke",
        value: { name: obj.package.name, description: obj.package.description },
      };
      const attachment = { ...heroCard, preview };
      attachments.push(attachment);
    });

    return {
      composeExtension: {
        type: "result",
        attachmentLayout: "list",
        attachments: attachments,
      },
    };
  }

  async handleTeamsMessagingExtensionSelectItem(context, obj) {
    return {
      composeExtension: {
        type: "result",
        attachmentLayout: "list",
        attachments: [CardFactory.heroCard(obj.name, obj.description)],
      },
    };
  }

  // Link Unfurling.
  handleTeamsAppBasedLinkQuery(context, query) {
    const attachment = CardFactory.thumbnailCard("Thumbnail Card", query.url, [query.url]);

    const result = {
      attachmentLayout: "list",
      type: "result",
      attachments: [attachment],
    };

    const response = {
      composeExtension: result,
    };
    return response;
  }
}

async function createCardCommand(context, action) {
  // The user has chosen to create a card by choosing the 'Create Card' context menu command.
  const data = action.data;
  // const DonateCard = CardFactory.adaptiveCard(rawDonationCard);
  // this.likeCountObj.likeCount = 0;
  let newDono = {
    Description: "no"
  }
  const card = cardTools.AdaptiveCards.declareWithoutData(rawFormCard).render();
  await context.sendActivity({ attachments: [CardFactory.adaptiveCard(card)] });
  // heroCard.content.subtitle = data.subTitle;
  // const attachment = {
  //   contentType: heroCard.contentType,
  //   content: heroCard.content,
  //   preview: heroCard,
  // };

  // return {
  //   composeExtension: {
  //     type: "result",
  //     attachmentLayout: "list",
  //     attachments: [attachment],
  //   },
  // };
}

function shareMessageCommand(context, action) {
  // The user has chosen to share a message by choosing the 'Share Message' context menu command.
  let userName = "unknown";
  if (
    action.messagePayload &&
    action.messagePayload.from &&
    action.messagePayload.from.user &&
    action.messagePayload.from.user.displayName
  ) {
    userName = action.messagePayload.from.user.displayName;
  }

  // This Messaging Extension example allows the user to check a box to include an image with the
  // shared message.  This demonstrates sending custom parameters along with the message payload.
  let images = [];
  const includeImage = action.data.includeImage;
  if (includeImage === "true") {
    images = [
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQtB3AwMUeNoq4gUBGe6Ocj8kyh3bXa9ZbV7u1fVKQoyKFHdkqU",
    ];
  }
  const heroCard = CardFactory.heroCard(
    `${userName} originally sent this message:`,
    action.messagePayload.body.content,
    images
  );

  if (
    action.messagePayload &&
    action.messagePayload.attachment &&
    action.messagePayload.attachments.length > 0
  ) {
    // This sample does not add the MessagePayload Attachments.  This is left as an
    // exercise for the user.
    heroCard.content.subtitle = `(${action.messagePayload.attachments.length} Attachments not included)`;
  }

  const attachment = {
    contentType: heroCard.contentType,
    content: heroCard.content,
    preview: heroCard,
  };

  return {
    composeExtension: {
      type: "result",
      attachmentLayout: "list",
      attachments: [attachment],
    },
  };
}

module.exports.TeamsBot = TeamsBot;
