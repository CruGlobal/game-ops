function onFormSubmit(e) {
  var itemResponses = e.response.getItemResponses();
  var emailAddress = "devops-engineering@cru.org";
  var subjectPrefix = "DNS Domain Transfer Questionnaires";
  var subject = subjectPrefix;
  var message = "";
  var ticketNumber = "";

  message += "<html><body>";
  for (var i = 0; i < itemResponses.length; i++) {
    var item = itemResponses[i].getItem();
    var question = item.getTitle();
    var questionId = item.getId(); // Get the question ID
    var answer = itemResponses[i].getResponse();
    message += "<p><b>" + question + ":</b> " + answer + "</p>";

    if (questionId === 656825872) { // Use the question ID
      ticketNumber = answer;
      break; // Exit the loop once the ticket number is found
    }
  }
  message += "</body></html>";

  if (ticketNumber) {
    subject += " - Ticket #" + ticketNumber;
  }

  MailApp.sendEmail({
    to: emailAddress,
    subject: subject,
    htmlBody: message
  });
}