const MISTAKE_DETECTION_RATIO = 1.2;

export class IOFXMLParser {
  constructor(
    splitsXmlDoc,
    className,
    mistakeDetectionRatio = MISTAKE_DETECTION_RATIO,
    date,
    timeZone
  ) {
    this.splitsXmlDoc = splitsXmlDoc;
    this.className = className;
    this.mistakeDetectionRatio = mistakeDetectionRatio;
    this.date = date;
    this.timeZone = timeZone;

    this.course = [];
    this.runners = [];
    this.leader = [];
    this.supermanOverallTimes = [];
    this.supermanSplitTimes = [];
    this.mistakesSum = [];

    this.calculateSplitTimes();
  }

  calculateSplitTimes() {
    this.loadSplitsFromXml();
    this.checkIfCourseIsComplete();
    this.calculateRanks();
    this.calculateSplitTimes();
    this.calculateSplitRanksAndTimeBehind();
    this.calculateOverallRanks();
    this.calculateMistakes();
  }

  loadSplitsFromXml() {
    let classResults = [...splitsXmlDoc.querySelectorAll("ClassResult")];
    let IOFXMLVersion = splitsXmlDoc
      .querySelector("ResultList")
      .getAttribute("iofVersion");

    // Find classResult by className
    let classResult = classResults.filter((classR) => {
      let name;

      if (IOFXMLVersion === "3.0") {
        name = classR.querySelector("Class Name").innerHTML;
      } else {
        name = classR.querySelector("ClassShortName").innerHTML;
      }
      console.log(name, className);
      return name === className;
    });

    let personResults = classResult[0].querySelectorAll("PersonResult");
    personResults.forEach((personResult, index) => {
      let id = index + 1;
      let familyName = "";
      if (personResult.querySelector("Family")) {
        familyName = personResult.querySelector("Family").innerHTML;
      }
      let firstName = personResult.querySelector("Given").innerHTML;
      let time = null;
      let startTime = null;
      let status = null;

      if (personResult.querySelector("StartTime")) {
        if (IOFXMLVersion === "3.0") {
          startTime =
            personResult.querySelector("StartTime").innerHTML + timezone;
          status = personResult.querySelector("Status").innerHTML;
          if (status) {
            time = Number(personResult.querySelector("Time").innerHTML);
          }
        } else {
          startTime =
            date +
            "T" +
            personResult.querySelector("StartTime").innerHTML +
            timezone;
          status = personResult
            .querySelector("CompetitorStatus")
            .getAttribute("value");
          if (status) {
            time = this.timeToSeconds(
              personResult.querySelector("Time").innerHTML
            ); // TODO
          }
        }
      }

      let runnerCourse = [...personResult.querySelectorAll("ControlCode")].map(
        (controlCode) => Number(controlCode.innerHTML)
      );
      let legs = [...personResult.querySelectorAll("SplitTime")].map(
        (splitTime) => {
          let controlCode = Number(
            splitTime.querySelector("ControlCode").innerHTML
          );
          let t = splitTime.querySelector("Time");
          let timeOverall;
          if (t) {
            if (IOFXMLVersion === "3.0") {
              timeOverall = Number(t.innerHTML);
            } else {
              timeOverall = this.timeToSeconds(t.innerHTML);
            }
          } else {
            timeOverall = null;
          }
          return { controlCode: controlCode, timeOverall: timeOverall };
        }
      );

      // Add split for finish
      legs.push({ controlCode: 999, timeOverall: time });
      runnerCourse.push(999);

      this.runners.push({
        id: id,
        course: runnerCourse,
        status: status,
        firstName: firstName,
        lastName: familyName,
        startTime: startTime,
        time: time,
        legs: legs,
        timeBehindSupermanGraphData: [],
        timeBehindLeaderGraphData: [],
      });
    });

    // Set reference course to first runner's course
    this.course = this.runners[0].course;
  }

  checkIfCourseIsComplete() {
    // Check if there is a SplitTime tag for every controls
    // Possible that there is no Time attached though
    this.runners.forEach((runner) => {
      if (this.arrayEquals(runner.course, this.course)) {
        runner.isComplete = true;
      } else {
        runner.isComplete = false;
      }
    });
    // For now only complete courses are keeped
    this.runners = this.runners.filter((runner) => runner.isComplete === true);
  }

  calculateRanks() {
    this.runners.sort((a, b) => this.sortRunners(a, b));
    let splitsLength = this.runners.length;
    let bestTime = this.runners[0].time;

    for (let i = 0; i < splitsLength; i++) {
      if (i > 0 && this.runners[i].time !== null) {
        if (this.runners[i].time === this.runners[i - 1].time) {
          this.runners[i].rank = this.runners[i - 1].rank;
        } else {
          this.runners[i].rank = i + 1;
        }
        this.runners[i].timeBehind = this.runners[i].time - bestTime;
      } else if (this.runners[i].time !== null) {
        this.runners[i].rank = i + 1;
        this.runners[i].timeBehind = this.runners[i].time - bestTime;
      }
    }
  }

  calculateSplitTimes() {
    this.runners.forEach((runner) => {
      runner.legs.forEach((leg, index) => {
        if (index === 0) {
          if (leg.timeOverall === null) {
            leg.time = null;
          } else {
            leg.time = leg.timeOverall;
          }
        } else {
          if (leg.timeOverall === null) {
            leg.time = null;
          } else if (runner.legs[index - 1].timeOverall === null) {
            leg.time = null;
          } else {
            leg.time = leg.timeOverall - runner.legs[index - 1].timeOverall;
          }
        }
      });
    });
  }

  calculateSplitRanksAndTimeBehind() {
    // For every legs of every runners calculate ranking and time behind
    this.course.forEach((leg, index) => {
      // Make an array with splits and id for one leg
      let legSplits = this.runners.map((runner) => {
        let lg = runner.legs.find((l) => l.controlCode === leg);
        return { id: runner.id, time: lg.time };
      });

      legSplits.sort((a, b) => this.sortRunners(a, b));

      // Populate the superman array
      if (index === 0) {
        this.superman.push(legSplits[0].time);
      } else {
        this.superman.push(this.superman[index - 1] + legSplits[0].time);
      }

      this.supermanSplits.push(legSplits[0].time);

      legSplits.forEach((legSplit, i) => {
        //manage equal ranks
        if (i > 0) {
          if (legSplit.time === legSplits[i - 1].time) {
            legSplit.rankSplit = legSplits[i - 1].rankSplit;
          } else {
            legSplit.rankSplit = i + 1;
          }
        } else {
          legSplit.rankSplit = i + 1;
        }
        let runnerIndex = this.runners.findIndex((r) => legSplit.id === r.id);
        this.runners[runnerIndex].legs[index].rankSplit = legSplit.rankSplit;
        if (this.runners[runnerIndex].legs[index].time === null) {
          this.runners[runnerIndex].legs[index].timeBehindSplit = null;
        } else {
          this.runners[runnerIndex].legs[index].timeBehindSplit =
            this.runners[runnerIndex].legs[index].time - legSplits[0].time;
        }
      });
    });
  }

  calculateOverallRanks() {
    // For every legs of every runners calculate ranking and time behind
    this.course.forEach((leg, index) => {
      // Make an array with overall times and id for one leg
      let legOverallTimes = this.runners.map((runner) => {
        let lg = runner.legs.find((l) => l.controlCode === leg);
        return { id: runner.id, time: lg.timeOverall };
      });

      legOverallTimes.sort((a, b) => this.sortRunners(a, b));

      this.leader.push(legOverallTimes[0].time);

      legOverallTimes.forEach((legOverallTime, i) => {
        //manage equal ranks
        if (i > 0) {
          if (legOverallTime.time === legOverallTimes[i - 1].time) {
            legOverallTime.rankSplit = legOverallTimes[i - 1].rankSplit;
          } else {
            legOverallTime.rankSplit = i + 1;
          }
        } else {
          legOverallTime.rankSplit = i + 1;
        }

        let runnerIndex = this.runners.findIndex(
          (r) => legOverallTime.id === r.id
        );
        this.runners[runnerIndex].legs[index].rankOverall =
          legOverallTime.rankSplit;

        if (this.runners[runnerIndex].legs[index].timeOverall === null) {
          this.runners[runnerIndex].legs[index].timeBehindOverall = null;
          this.runners[runnerIndex].legs[index].timeBehindSuperman = null;
        } else {
          this.runners[runnerIndex].legs[index].timeBehindOverall =
            this.runners[runnerIndex].legs[index].timeOverall -
            legOverallTimes[0].time;
          this.runners[runnerIndex].legs[index].timeBehindSuperman =
            this.runners[runnerIndex].legs[index].timeOverall -
            this.superman[index];
        }
      });
    });
  }

  calculateMistakes() {
    // Initialize mistakesSum array for mistake graph
    this.mistakesSum = new Array(this.course.length).fill(0);

    this.runners.forEach((runner) => {
      if (runner.status === "OK") {
        let percentageBehindSuperman = runner.legs.map((leg, legIndex) => {
          return leg.time / this.supermanSplits[legIndex];
        });
        let averagePercentage = this.arrayAverage(percentageBehindSuperman);

        let clearedPercentageBehindSuperman = [];
        percentageBehindSuperman.forEach((leg, legIndex) => {
          if (leg > averagePercentage * this.mistakeDetectionRatio) {
            runner.legs[legIndex].isMistake = true;
          } else {
            runner.legs[legIndex].isMistake = false;
            clearedPercentageBehindSuperman.push(leg);
          }
          // Make dataset for "Time behind superman"
          runner.timeBehindSupermanGraphData.push({
            x: this.superman[legIndex],
            y: runner.legs[legIndex].timeBehindSuperman,
          });
          // Make dataset for "Time behind leader"
          runner.timeBehindLeaderGraphData.push({
            x: this.leader[legIndex],
            y: runner.legs[legIndex].timeBehindOverall,
          });
        });

        // Recalculate average without mistakes
        let clearedAveragePercentage = this.arrayAverage(
          clearedPercentageBehindSuperman
        );

        // New pass to be sure to get all mistakes
        clearedPercentageBehindSuperman = [];
        percentageBehindSuperman.forEach((leg, legIndex) => {
          if (leg > clearedAveragePercentage * this.mistakeDetectionRatio) {
            runner.legs[legIndex].isMistake = true;
            this.mistakesSum[legIndex]++;
          } else {
            runner.legs[legIndex].isMistake = false;
            clearedPercentageBehindSuperman.push(leg);
          }
        });

        // Recalculate average without mistakes
        clearedAveragePercentage = this.arrayAverage(
          clearedPercentageBehindSuperman
        );

        let totalTimeLost = 0;
        runner.legs.forEach((leg, legIndex) => {
          if (leg.isMistake) {
            leg.timeWithoutMistake = Math.round(
              this.supermanSplits[legIndex] * clearedAveragePercentage
            );
            leg.timeLost = leg.time - leg.timeWithoutMistake;
            totalTimeLost = totalTimeLost + leg.timeLost;
          }
        });
        runner.totalTimeLost = totalTimeLost;
      }
    });
  }

  // Utils

  sortRunners(a, b) {
    if (a.time !== null && b.time !== null) {
      return a.time - b.time;
    } else if (a.time === null && b.time !== null) {
      return 1;
    } else if (a.time !== null && b.time === null) {
      return -1;
    } else {
      return 0;
    }
  }

  arrayEquals(a, b) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((val, index) => val === b[index])
    );
  }

  arrayAverage(a) {
    let b = a.length,
      c = 0,
      i;
    for (i = 0; i < b; i++) {
      c += Number(a[i]);
    }
    return c / b;
  }

  timeToSeconds(time) {
    // Convert a time in HH:MM:SS format to seconds
    let array = time.split(":");
    let length = array.length;
    let seconds = Number(array[length - 1]);

    if (length > 1) {
      seconds += Number(array[length - 2] * 60);
    }

    if (length > 2) {
      seconds += Number(array[length - 3] * 3600);
    }

    return seconds;
  }
}
